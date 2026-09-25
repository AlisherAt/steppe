"""Искусственные карточки: не доказательство доступности реальных магазинов."""
import asyncio
import unittest
from main import parse_snapshot, SCRAPERS
from scrapers.base_scraper import BaseBrandScraper


def fixture(source, sale='$60.00', sku=True, href='/shoe/AB1234.html'):
    url = SCRAPERS[source].SALE_URL
    html = f'''<div class="product-card product-tile ProductCard" data-testid="plp-product-card"
       {'data-product-sku="AB1234"' if sku else ''}>
       <a class="product-card__link-overlay" href="{href}">Test Shoes</a>
       <h3 data-testid="product-card-description-link" class="product-card__title product-card__name product-tile__title product-tile__name product-name ProductCard-title">Test Shoes</h3>
       <img src="https://images.example/shoe.jpg">
       <s data-testid="original-price" class="price-standard price__original strike-through ProductCard-originalPrice"><span data-testid="product-price" class="value">$100.00</span></s>
       <span data-testid="sale-price" class="price-sales price__sale sales ProductCard-salePrice"><span data-testid="product-price-reduced" class="value">{sale}</span></span>
       </div>'''
    return dict(source=source,url=url,html=html)


class ParserTests(unittest.TestCase):
    def test_all_ten_user_modules(self):
        for source in SCRAPERS:
            with self.subTest(source=source):
                result = asyncio.run(parse_snapshot(fixture(source)))['products']
                self.assertEqual(len(result), 1)
                self.assertEqual(result[0]['sale_price'], 60)
                self.assertEqual(result[0]['old_price'], 100)
                self.assertFalse(result[0]['size_price_verified'])

    def test_prices_are_not_ranges_or_installments(self):
        for text in ('$80–$100', 'from $80', '$20 / month', '€ 39,99', 'NaN', '-$30', '$0'):
            self.assertIsNone(BaseBrandScraper.parse_price(text))
        self.assertEqual(BaseBrandScraper.parse_price('US$1,299.50'), 1299.50)

    def test_bad_price_and_missing_sku_not_published(self):
        for data in (fixture('hoka',sale='$80–$100'),
                     fixture('hoka',sale='$110'),fixture('hoka',href='https://evil.example/shoe')):
            self.assertEqual(asyncio.run(parse_snapshot(data))['products'], [])

    def test_duplicate_cards(self):
        data=fixture('hoka')
        data['html']*=2
        self.assertEqual(len(asyncio.run(parse_snapshot(data))['products']),1)

    def test_origin_mismatch(self):
        data=fixture('hoka')
        data['url']='https://evil.example/sale'
        with self.assertRaises(ValueError):
            asyncio.run(parse_snapshot(data))

    def test_adidas_sku_from_url(self):
        data=fixture('adidas',sku=False,href='/us/test-shoes/AB1234.html')
        self.assertEqual(asyncio.run(parse_snapshot(data))['products'][0]['sku'],'AB1234')

    def test_missing_sku_waits_for_detail(self):
        self.assertIsNone(asyncio.run(parse_snapshot(fixture('hoka',sku=False)))['products'][0]['sku'])

    def test_detail_graph_excludes_related_product_and_out_of_stock(self):
        data=fixture('hoka')
        data.update(mode='detail',name='Test Shoes',url='https://www.hoka.com/en/us/test.html',html='''
          <script type="application/ld+json">{"@graph":[
           {"@type":"Product","name":"Other","sku":"WRONG"},
           {"@type":"Product","name":"Test Shoes","sku":"REAL","offers":[
            {"size":"US 7","availability":"https://schema.org/InStock"},
            {"size":"US 8","availability":"https://schema.org/OutOfStock"}]}]}</script>''')
        self.assertEqual(asyncio.run(parse_snapshot(data))['detail'],dict(sku='REAL',size_candidates=['US 7']))

    def test_detail_dom_does_not_mark_disabled_sizes_available(self):
        data=fixture('hoka')
        data.update(mode='detail',name='Test Shoes',html='''<div class="size-selector">
          <button>7</button><button disabled>8</button><button aria-disabled="true">9</button></div>''')
        result=asyncio.run(parse_snapshot(data))['detail']
        self.assertEqual(result['size_candidates'],['7'])
        self.assertNotIn('size_price_verified',result)


if __name__ == '__main__':
    unittest.main()
