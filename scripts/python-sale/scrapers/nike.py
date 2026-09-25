"""Парсер карточек из предоставленного пользователем файла; селекторы требуют живой проверки."""
from scrapers.base_scraper import ElementHandle, Page
from scrapers.base_scraper import BaseBrandScraper
from models import Product


class NikeScraper(BaseBrandScraper):
    BRAND = "Nike"
    SALE_URL = "https://www.nike.com/w/sale"
    PRODUCT_CARD_SELECTOR = "div.product-card"
    USE_INFINITE_SCROLL = True

    async def parse_card(self, card: ElementHandle, page: Page) -> Product | None:
        name_el = await card.query_selector(".product-card__title")
        name = (await name_el.inner_text()).strip() if name_el else None

        link_el = await card.query_selector("a.product-card__link-overlay")
        url = await link_el.get_attribute("href") if link_el else None

        img_el = await card.query_selector("img")
        image_url = await img_el.get_attribute("src") if img_el else None

        current_price_el = await card.query_selector("[data-testid='product-price-reduced']")
        original_price_el = await card.query_selector("[data-testid='product-price']")

        current_price = self.parse_price(await current_price_el.inner_text()) if current_price_el else None
        original_price = self.parse_price(await original_price_el.inner_text()) if original_price_el else current_price

        if not name or not url:
            return None

        return Product(
            brand=self.BRAND,
            name=name,
            url=url,
            image_urls=[image_url] if image_url else [],
            current_price=current_price,
            original_price=original_price,
            currency="USD",
        )
