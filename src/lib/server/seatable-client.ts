import { z } from 'zod';
import { fetchText, IntegrationError } from './http';
export type SeaRow = Record<string, unknown> & { _id: string };
type Column = { name: string; type: string };
export const seaSchema: Record<string, Column[]> = {
  STEPPE_Scrapes: [
    { name: 'id', type: 'text' },
    { name: 'checked_at', type: 'text' },
    { name: 'payload', type: 'long-text' },
  ],
  STEPPE_Users: ['id', 'username', 'password_hash', 'created_at'].map((name) => ({
    name,
    type: 'text',
  })),
  STEPPE_Sessions: ['token_hash', 'user_id', 'expires_at'].map((name) => ({ name, type: 'text' })),
  STEPPE_AuthAttempts: ['account_hash', 'ip_hash', 'created_at'].map((name) => ({
    name,
    type: 'text',
  })),
  STEPPE_Sources: [
    { name: 'id', type: 'text' },
    { name: 'name', type: 'text' },
    { name: 'paused', type: 'checkbox' },
  ],
  STEPPE_Offers: ['key', 'snapshot', 'source_id', 'product_id', 'created_at']
    .map((name) => ({ name, type: 'text' }))
    .concat([{ name: 'payload', type: 'long-text' }]),
  STEPPE_Runs: ['id', 'source_id', 'started_at', 'finished_at', 'status', 'checksum', 'error']
    .map((name) => ({ name, type: 'text' }))
    .concat([
      { name: 'count', type: 'number' },
      { name: 'rates', type: 'long-text' },
    ]),
};
const authSchema = z.object({
  access_token: z.string().min(1),
  dtable_uuid: z.string().uuid(),
  dtable_name: z.string(),
  workspace_id: z.number(),
});
const metadataSchema = z.object({
  metadata: z.object({
    tables: z.array(
      z.object({
        name: z.string(),
        columns: z.array(z.object({ name: z.string(), type: z.string() })),
      }),
    ),
  }),
});
export interface SeaTransport {
  rows(table: string): Promise<SeaRow[]>;
  append(table: string, rows: Record<string, unknown>[]): Promise<void>;
  update(table: string, id: string, row: Record<string, unknown>): Promise<void>;
  remove(table: string, ids: string[]): Promise<void>;
}
export class SeaTableClient implements SeaTransport {
  private auth?: { data: z.infer<typeof authSchema>; until: number; key: string };
  private authenticating?: Promise<z.infer<typeof authSchema>>;
  private origin() {
    const url = new URL(process.env.SEATABLE_SERVER_URL || 'https://cloud.seatable.io');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new IntegrationError('SEATABLE_SERVER_URL_INVALID');
    return url.origin;
  }
  async authenticate() {
    const key = `${this.origin()}|${process.env.SEATABLE_API_TOKEN}|${process.env.SEATABLE_BASE_NAME}|${process.env.SEATABLE_WORKSPACE_ID}`;
    if (this.auth?.key === key && this.auth.until > Date.now()) return this.auth.data;
    if (this.authenticating) return this.authenticating;
    this.authenticating = (async () => {
      if (!process.env.SEATABLE_API_TOKEN) throw new IntegrationError('SEATABLE_NOT_CONFIGURED');
      const text = await fetchText(`${this.origin()}/api/v2.1/dtable/app-access-token/?exp=1h`, {
        hosts: [new URL(this.origin()).hostname],
        token: process.env.SEATABLE_API_TOKEN,
      });
      const parsed = authSchema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new IntegrationError('SEATABLE_INVALID_AUTH');
      const data = parsed.data;
      if (
        (process.env.SEATABLE_BASE_NAME && data.dtable_name !== process.env.SEATABLE_BASE_NAME) ||
        (process.env.SEATABLE_WORKSPACE_ID &&
          String(data.workspace_id) !== process.env.SEATABLE_WORKSPACE_ID)
      )
        throw new IntegrationError('SEATABLE_WRONG_BASE');
      this.auth = { data, key, until: Date.now() + 50 * 60_000 };
      return data;
    })();
    try {
      return await this.authenticating;
    } finally {
      this.authenticating = undefined;
    }
  }
  private async request(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: unknown,
    renew = true,
  ): Promise<Record<string, unknown>> {
    const auth = await this.authenticate();
    try {
      const result = JSON.parse(
        await fetchText(`${this.origin()}/api-gateway/api/v2/dtables/${auth.dtable_uuid}/${path}`, {
          hosts: [new URL(this.origin()).hostname],
          token: auth.access_token,
          method,
          body: body === undefined ? undefined : JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
          // Retrying an ambiguous append can duplicate rows. Only reads are retried.
          attempts: method === 'GET' ? 3 : 1,
          maxBytes: 20_000_000,
        }),
      );
      if (
        !result ||
        typeof result !== 'object' ||
        result.success === false ||
        result.error ||
        result.error_msg ||
        result.error_message
      )
        throw new IntegrationError('SEATABLE_API_ERROR');
      return result;
    } catch (e) {
      if (renew && e instanceof IntegrationError && e.code === 'UPSTREAM_HTTP_401') {
        this.auth = undefined;
        return this.request(path, method, body, false);
      }
      throw e;
    }
  }
  async ensureSchema(create = false) {
    let metadata = metadataSchema.parse(await this.request('metadata/'));
    for (const [name, columns] of Object.entries(seaSchema)) {
      const table = metadata.metadata.tables.find((t) => t.name === name);
      if (!table && create)
        await this.request('tables/', 'POST', {
          table_name: name,
          columns: columns.map((c) => ({ column_name: c.name, column_type: c.type })),
        });
      else if (
        !table ||
        columns.some(
          (c) =>
            !table.columns.some((existing) => existing.name === c.name && existing.type === c.type),
        )
      )
        throw new IntegrationError('SEATABLE_SCHEMA_MISMATCH');
    }
    if (create) {
      metadata = metadataSchema.parse(await this.request('metadata/'));
      for (const [name, columns] of Object.entries(seaSchema)) {
        const table = metadata.metadata.tables.find((t) => t.name === name);
        if (
          !table ||
          columns.some((c) => !table.columns.some((x) => x.name === c.name && x.type === c.type))
        )
          throw new IntegrationError('SEATABLE_SCHEMA_MISMATCH');
      }
    }
    return Object.keys(seaSchema);
  }
  async rows(table: string): Promise<SeaRow[]> {
    if (!(table in seaSchema)) throw new IntegrationError('SEATABLE_TABLE_NOT_ALLOWED');
    const rows: SeaRow[] = [];
    for (let start = 0; start <= 100_000; start += 1000) {
      const data = await this.request(
        `rows/?${new URLSearchParams({ table_name: table, convert_keys: 'true', start: String(start), limit: '1000' })}`,
      );
      const page = z
        .array(z.object({ _id: z.string() }).catchall(z.unknown()))
        .safeParse(data.rows);
      if (!page.success) throw new IntegrationError('SEATABLE_INVALID_ROWS');
      rows.push(...page.data);
      if (rows.length > 100_000) throw new IntegrationError('SEATABLE_ROW_LIMIT');
      if (page.data.length < 1000) return rows;
    }
    throw new IntegrationError('SEATABLE_ROW_LIMIT');
  }
  async append(table: string, rows: Record<string, unknown>[]) {
    for (let i = 0; i < rows.length; i += 100)
      await this.request('rows/', 'POST', { table_name: table, rows: rows.slice(i, i + 100) });
  }
  async update(table: string, id: string, row: Record<string, unknown>) {
    await this.request('rows/', 'PUT', { table_name: table, updates: [{ row_id: id, row }] });
  }
  async remove(table: string, ids: string[]) {
    for (let i = 0; i < ids.length; i += 1000)
      await this.request('rows/', 'DELETE', { table_name: table, row_ids: ids.slice(i, i + 1000) });
  }
}
export const seaClient = new SeaTableClient();
