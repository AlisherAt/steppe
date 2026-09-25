import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { getSources } from '@/lib/server/repository';
import { formatDate } from '@/lib/money';
import { scrapeSummary } from '@/lib/server/scrape-report';
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
  const scrape = await scrapeSummary().catch(() => null);
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
      <section className="info-panel">
        <h2>Проверка сайтов брендов</h2>
        <p>
          Расписание: 10:00 и 21:00 по Москве. Данные без подтверждённых размеров и наличия не
          публикуются как предложения для заказа.
        </p>
        {scrape ? (
          <p>
            Последняя проверка: {formatDate(scrape.checkedAt)} · источников: {scrape.sources}.
            Ожидают разрешения: {scrape.waiting}; ошибки или ограничения доступа: {scrape.failed};
            собрано карточек: {scrape.collected}; с проверенными размерами: {scrape.verified}.
          </p>
        ) : (
          <p>Отчёт пока недоступен.</p>
        )}
      </section>
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
        <h2>Наш ассортимент</h2>
        <p>
          В каталоге представлены только Puma и Reebok. Собираем скидки официальных магазинов США и
          проверяем доступность каждого размера.
        </p>
        <p>
          Реально подключённые магазины отмечены выше по результату последней загрузки. Возможность
          подключения сама по себе не означает, что товары уже загружаются.
        </p>
        <Link href="/brands">
          Открыть справочник брендов <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="info-panel">
        <h2>Покупка по фиксированной цене</h2>
        <p>
          Принимаем предложения магазинов США и Европы с покупкой без торгов и наличием каждого
          размера. Для официальных магазинов проверяется регион США или Европы; местонахождение
          склада не заявляется. Импорт StockX отключён: рыночная котировка не подтверждает стоимость
          выкупа.
        </p>
        <p>
          По каждой модели показана минимальная доступная цена. Размеры подписаны EU или US; для
          каждого показывается своя цена. Если прежняя цена неизвестна, скидка не отображается.
        </p>
      </div>
      <div className="info-panel">
        <h2>Как обновляется каталог</h2>
        <p>
          Автоматическая проверка запланирована на 10:00 и 21:00 по времени Москвы. Фактическое
          время последней проверки отображается выше. При временном сбое предусмотрены повторные
          попытки.
        </p>
        <p>
          Предложения, исчезнувшие из полного фида, скрываются. Необновлённые предложения также
          исчезают по истечении срока актуальности — по умолчанию 36 часов. Окончательную цену
          выбранного размера уточняйте на площадке.
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
