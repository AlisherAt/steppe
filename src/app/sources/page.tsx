import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { getSources } from '@/lib/server/repository';
import { formatDate } from '@/lib/money';
import { sourceOptions } from '@/lib/source-options';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Магазины и источники — STEPPE' };
const labels = {
  ready: 'Подключён',
  needs_configuration: 'Ожидает подключения',
  paused: 'На паузе',
  error: 'Ошибка обновления',
};
export default async function SourcesPage() {
  const sources = await getSources().catch(() => null);
  return (
    <main id="main-content" className="page-content">
      <Link className="text-link" href="/">
        <ArrowLeft size={16} />В каталог
      </Link>
      <div className="page-heading">
        <h1>
          Прозрачно.
          <br />
          До последней пары.
        </h1>
        <p>
          Здесь видно, какие магазины подключены и когда мы в последний раз получили их данные.
          Демонстрационные карточки не входят в реальные предложения.
        </p>
      </div>
      {!sources ? (
        <p role="alert" className="notice warning">
          Не удалось получить статус магазинов. Обновите страницу через несколько секунд.
        </p>
      ) : (
        <div className="source-grid">
          {sources.map((s) => (
            <article className="source-card" key={s.id}>
              <div className="source-title">
                <h2>{s.name}</h2>
                <span className={`status-badge ${s.status}`}>{labels[s.status]}</span>
              </div>
              <p>
                {s.message.replace(/ с доставкой KZ| для Казахстана| с доставкой в Казахстан/g, '')}
              </p>
              <dl>
                <div>
                  <dt>Последняя попытка</dt>
                  <dd>{s.lastAttempt ? formatDate(s.lastAttempt) : 'Проверок ещё не было'}</dd>
                </div>
                <div>
                  <dt>Успешное обновление</dt>
                  <dd>{s.lastSuccess ? formatDate(s.lastSuccess) : 'Данных пока нет'}</dd>
                </div>
                <div>
                  <dt>Предложений при последней загрузке</dt>
                  <dd>{s.offerCount}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
      <div className="info-panel">
        <h2>Альтернативы сайтам брендов</h2>
        <p>
          Мультибрендовые магазины и партнёрские сети позволяют получать разные марки из одного
          источника. Регистрация и разрешение на данные нужны один раз, затем загрузки выполняются
          по расписанию.
        </p>
        <p>
          Реально подключённые магазины отмечены выше по результату последней загрузки. Возможность
          подключения сама по себе не означает, что товары уже загружаются.
        </p>
        <Link href="/brands">
          Открыть справочник брендов <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="source-grid">
        {sourceOptions
          .filter((option) => option.name === 'KicksDB')
          .map((option) => (
            <section className="source-card" key={option.name}>
              <span className="eyebrow">{option.kind}</span>
              <h2 style={{ fontSize: 22, marginTop: 12 }}>{option.name}</h2>
              <p>{option.detail}</p>
              <a className="text-link" href={option.url} target="_blank" rel="noopener noreferrer">
                Информация об источнике <ArrowUpRight size={14} />
              </a>
            </section>
          ))}
      </div>
      <div className="info-panel">
        <h2>Цены рынка США</h2>
        <p>
          StockX через KicksDB: исходные цены в USD, рынок US. Это рынок цены, а не указание страны
          производства или склада.
        </p>
        <p>
          По каждой модели показана минимальная доступная цена и размеры EU по этой цене. Если
          прежняя цена неизвестна, скидка не отображается.
        </p>
      </div>
      <div className="info-panel">
        <h2>Как обновляется каталог</h2>
        <p>
          После подключения источников автоматическая проверка запланирована на 06:00 и 18:00 по
          времени Алматы. Фактическое время последней проверки отображается выше. При временном сбое
          предусмотрены повторные попытки.
        </p>
        <p>
          Предложения, исчезнувшие из полного фида, скрываются. Необновлённые предложения также
          исчезают по истечении срока актуальности — по умолчанию 36 часов. Окончательную цену
          выбранного размера уточняйте на площадке.
        </p>
      </div>
      <div className="info-panel">
        <h2>Партнёрские источники</h2>
        <p>
          Каталог рынка США получает данные через KicksDB. Дополнительные источники скидок подключаются отдельно: для Nike требуется доступ к
          автоматическому товарному фиду после одобрения участия в программе. Для Adidas —
          согласованный с партнёрской программой источник данных. Условия зависят от региона.
        </p>
        <p>
          <a
            href="https://www.nike.com/help/a/nike-affiliate-program/app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Программа Nike <ArrowUpRight size={13} />
          </a>{' '}
          ·{' '}
          <a
            href="https://www.adidas.com/us/help/us-company-information/what-is-our-affiliate-program"
            target="_blank"
            rel="noopener noreferrer"
          >
            Программа Adidas <ArrowUpRight size={13} />
          </a>
        </p>
      </div>
      <div className="info-panel">
        <h2>Курсы валют</h2>
        <p>
          Для цен в иностранной валюте основной предусмотренный источник — официальный XML-канал
          Национального Банка Казахстана. Источник курса, дата его действия и время пересчёта
          указаны в каждой реальной карточке.
        </p>
        <p>
          Подтверждённый открытый источник курса Kaspi не подключён. Курс НБРК не называется курсом
          Kaspi. При наличии разрешённого API оператор может подключить другой источник или явно
          обозначенный ручной резерв. Без действующего курса новые цены в этой валюте не
          публикуются.
        </p>
        <a href="https://nationalbank.kz/ru/page/RSS" target="_blank" rel="noopener noreferrer">
          Официальные RSS-каналы НБРК <ArrowUpRight size={13} />
        </a>
      </div>
    </main>
  );
}
