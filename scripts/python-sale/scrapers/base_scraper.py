"""Совместимость пользовательских parse_card с HTML, уже отрисованным Playwright.

Сеть, robots.txt, скролл, пагинация и блокировки контролирует Node.js-сборщик.
Python не открывает вторую сессию магазина и не выполняет JavaScript из HTML.
"""
import re
import json
from urllib.parse import urlsplit
from decimal import Decimal, InvalidOperation
from bs4 import BeautifulSoup


class ElementHandle:
    def __init__(self, element):
        self.element = element

    async def query_selector(self, selector):
        found = self.element.select_one(selector)
        return ElementHandle(found) if found is not None else None

    async def inner_text(self):
        return self.element.get_text(' ', strip=True)

    async def get_attribute(self, name):
        value = self.element.get(name)
        return ' '.join(value) if isinstance(value, list) else value


class Page(ElementHandle):
    def __init__(self, html):
        super().__init__(BeautifulSoup(html, 'html.parser'))


class BaseBrandScraper:
    # Из второй версии пользователя. Это наблюдаемые подписи, не проверенные варианты.
    SIZE_SELECTOR_CANDIDATES = [
        "button[data-testid*='size' i]", "button[aria-label*='size' i]",
        "[data-qa*='size' i] button", "li.size-attribute button, li.size-attribute label",
        ".size-selector button, .size-selector label", ".product-size-selector button",
        "select[name*='size' i] option", "select[id*='size' i] option",
        "fieldset[data-testid*='size' i] label",
    ]

    async def extract_detail(self, page, product_url, product_name):
        result = {'sku': None, 'size_candidates': []}
        def walk(value):
            if isinstance(value, list):
                for child in value:
                    yield from walk(child)
            elif isinstance(value, dict):
                if value.get('@type') == 'Product':
                    yield value
                if '@graph' in value:
                    yield from walk(value['@graph'])
        for script in page.element.select('script[type="application/ld+json"]'):
            try:
                items = list(walk(json.loads(script.get_text())))
            except (ValueError, TypeError, RecursionError):
                continue
            for item in items:
                # Не забираем SKU рекомендуемого товара из той же страницы.
                if item.get('url'):
                    if urlsplit(item['url']).path != urlsplit(product_url).path:
                        continue
                elif str(item.get('name', '')).strip().lower() != product_name.strip().lower():
                    continue
                sku = item.get('sku') or item.get('mpn')
                if isinstance(sku, (str, int)) and 0 < len(str(sku)) <= 160:
                    if result['sku'] and result['sku'] != str(sku):
                        raise ValueError('AMBIGUOUS_DETAIL_SKU')
                    result['sku'] = str(sku)
                offers = item.get('offers', [])
                for offer in offers if isinstance(offers, list) else [offers]:
                    if not isinstance(offer, dict) or offer.get('availability') not in (
                        'https://schema.org/InStock', 'http://schema.org/InStock'):
                        continue
                    variant = offer.get('itemOffered', {})
                    size = offer.get('size') or (variant.get('size') if isinstance(variant, dict) else None)
                    if isinstance(size, (str, int, float)) and 0 < len(str(size)) <= 40:
                        result['size_candidates'].append(str(size))
        if not result['size_candidates']:
            for selector in self.SIZE_SELECTOR_CANDIDATES:
                for element in page.element.select(selector):
                    if element.has_attr('disabled') or element.get('aria-disabled') == 'true':
                        continue
                    if element.find_parent(attrs={'disabled': True}) or element.has_attr('hidden'):
                        continue
                    if re.search(r'unavailable|sold.out|disabled', ' '.join(element.get('class', [])), re.I):
                        continue
                    label = element.get_text(' ', strip=True)
                    if label and len(label) <= 40 and label.lower() not in ('select size', 'size'):
                        result['size_candidates'].append(label)
                if result['size_candidates']:
                    break
        result['size_candidates'] = list(dict.fromkeys(result['size_candidates']))[:60]
        return result

    @staticmethod
    def parse_price(raw):
        # Только одно точное значение USD; диапазон/рассрочка/"from" отклоняются.
        if raw is None:
            return None
        text = re.sub(r'^(?:USD\s*|US\$\s*|\$\s*)', '', raw.strip())
        if not re.fullmatch(r'(?:\d{1,7}|\d{1,3}(?:,\d{3}){1,2})(?:\.\d{1,2})?', text):
            return None
        try:
            value = Decimal(text.replace(',', ''))
            return float(value) if value > 0 and value <= Decimal('9999999.99') else None
        except InvalidOperation:
            return None
