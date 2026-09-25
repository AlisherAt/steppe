"""Парсер карточек из предоставленного пользователем файла; селекторы требуют живой проверки."""
from scrapers.base_scraper import ElementHandle, Page
from scrapers.base_scraper import BaseBrandScraper
from models import Product


class SalomonScraper(BaseBrandScraper):
    BRAND = "Salomon"
    SALE_URL = "https://www.salomon.com/en-us/shop/sale.html"
    PRODUCT_CARD_SELECTOR = "div.product-tile, li.product-item"
    USE_INFINITE_SCROLL = True

    async def parse_card(self, card: ElementHandle, page: Page) -> Product | None:
        name_el = await card.query_selector(".product-tile__name, .product-name")
        name = (await name_el.inner_text()).strip() if name_el else None

        link_el = await card.query_selector("a")
        href = await link_el.get_attribute("href") if link_el else None
        url = f"https://www.salomon.com{href}" if href and href.startswith("/") else href

        img_el = await card.query_selector("img")
        image_url = await img_el.get_attribute("src") if img_el else None

        current_price_el = await card.query_selector(".sales, .price-sales")
        original_price_el = await card.query_selector(".strike-through, .price-standard")

        current_price = self.parse_price(await current_price_el.inner_text()) if current_price_el else None
        original_price = self.parse_price(await original_price_el.inner_text()) if original_price_el else current_price

        if not name or not url:
            return None

        return Product(
            brand=self.BRAND, name=name, url=url,
            image_urls=[image_url] if image_url else [],
            current_price=current_price, original_price=original_price, currency="USD",
        )
