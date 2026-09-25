"""Запуск десяти предоставленных парсеров над снимком DOM из Playwright.

Вход stdin: {source, url, html, max}. Выход stdout: JSON с частными кандидатами.
Ни один результат этого этапа не подтверждает цену или наличие размера.
"""
import asyncio
import json
import re
import sys
from urllib.parse import urljoin, urlsplit, urlunsplit
from scrapers.base_scraper import ElementHandle, Page
from scrapers.adidas import AdidasScraper
from scrapers.nike import NikeScraper
from scrapers.new_balance import NewBalanceScraper
from scrapers.asics import AsicsScraper
from scrapers.converse import ConverseScraper
from scrapers.vans import VansScraper
from scrapers.under_armour import UnderArmourScraper
from scrapers.skechers import SkechersScraper
from scrapers.salomon import SalomonScraper
from scrapers.hoka import HokaScraper

SCRAPERS = dict(adidas=AdidasScraper, nike=NikeScraper, newbalance=NewBalanceScraper,
               asics=AsicsScraper, converse=ConverseScraper, vans=VansScraper,
               underarmour=UnderArmourScraper, skechers=SkechersScraper,
               salomon=SalomonScraper, hoka=HokaScraper)


async def parse_snapshot(data):
    source = data['source']
    scraper = SCRAPERS[source]()
    origin = urlsplit(scraper.SALE_URL)
    page_url = urlsplit(data['url'])
    if (page_url.scheme, page_url.netloc) != (origin.scheme, origin.netloc):
        raise ValueError('SOURCE_ORIGIN_MISMATCH')
    limit = data.get('max', 100)
    if type(limit) is not int or not 1 <= limit <= 100:
        raise ValueError('INVALID_LIMIT')
    page = Page(data['html'])
    if data.get('mode') == 'detail':
        return {'detail': await scraper.extract_detail(page, data['url'], data['name'])}
    products, seen, failed = [], set(), 0
    for node in page.element.select(scraper.PRODUCT_CARD_SELECTOR)[:limit]:
        try:
            product = await scraper.parse_card(ElementHandle(node), page)
            if not product or not product.current_price or not product.original_price:
                continue
            if product.current_price >= product.original_price:
                continue
            if not re.search(r'\b(shoes?|sneakers?|trainers?|footwear)\b', node.get_text(' '), re.I):
                continue
            if re.search(r'\b(slides?|sandals?|boots?|cleats?|socks?|shirts?|insoles?)\b', node.get_text(' '), re.I):
                continue
            url = urlsplit(urljoin(data['url'], product.url))
            if (url.scheme, url.netloc) != (origin.scheme, origin.netloc) or url.username or url.password:
                continue
            product.url = urlunsplit((url.scheme, url.netloc, url.path, url.query, ''))
            image = urlsplit(urljoin(data['url'], product.image_urls[0])) if product.image_urls else None
            if image is None or image.scheme != 'https' or not image.netloc or image.username or image.password:
                continue
            product.image_urls = [image.geturl()]
            sku_node = node.select_one('[itemprop="sku"], [data-testid="product-sku"], .product-sku')
            product.sku = (node.get('data-product-sku') or node.get('data-style-color') or
                           (sku_node.get('content') or sku_node.get_text(strip=True) if sku_node else None))
            if not product.sku and source in ('adidas', 'nike'):
                match = re.search(r'/([A-Z0-9]{6})\.html$' if source == 'adidas' else r'/([A-Z0-9]{6}-\d{3})$', url.path)
                product.sku = match[1] if match else None
            if (product.sku and len(product.sku) > 160) or product.url in seen:
                continue
            seen.add(product.url)
            product.compute_discount()
            products.append(dict(source=source,brand=product.brand,sku=product.sku,name=product.name,
                image_url=product.image_urls[0],product_url=product.url,old_price=product.original_price,
                sale_price=product.current_price,currency=product.currency,checked_at=product.scraped_at,
                size_price_verified=False))
        except (ValueError, TypeError, AttributeError, IndexError):
            failed += 1
    return dict(products=products, rejected_errors=failed)


def main():
    raw = sys.stdin.buffer.read(4_000_001)
    if len(raw) > 4_000_000:
        raise ValueError('SNAPSHOT_TOO_LARGE')
    result = asyncio.run(parse_snapshot(json.loads(raw.decode('utf-8-sig'))))
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Не печатаем исходный HTML и URL с возможными параметрами сессии.
        print('PYTHON_PARSER_FAILED', file=sys.stderr)
        sys.exit(1)
