"""Парсер карточек из предоставленного пользователем файла; селекторы требуют живой проверки."""
from scrapers.base_scraper import ElementHandle, Page
from scrapers.base_scraper import BaseBrandScraper
from models import Product


class AdidasScraper(BaseBrandScraper):
    BRAND = "Adidas"
    SALE_URL = "https://www.adidas.com/us/sale"
    PRODUCT_CARD_SELECTOR = "[data-testid='plp-product-card'], [data-auto-id='product-container']"
    USE_INFINITE_SCROLL = True

    async def extra_page_setup(self, page: Page):
        # Cookie consent banner
        for sel in ["#onetrust-accept-btn-handler", "button:has-text('Accept')"]:
            try:
                btn = await page.query_selector(sel)
                if btn:
                    await btn.click()
                    break
            except Exception:
                pass

    async def parse_card(self, card: ElementHandle, page: Page) -> Product | None:
        name_el = await card.query_selector("[data-testid='product-card-description-link'], [data-auto-id='product-card-title']")
        name = (await name_el.inner_text()).strip() if name_el else None

        link_el = await card.query_selector("a")
        href = await link_el.get_attribute("href") if link_el else None
        url = f"https://www.adidas.com{href}" if href and href.startswith("/") else href

        img_el = await card.query_selector("img")
        image_url = await img_el.get_attribute("src") if img_el else None

        current_price_el = await card.query_selector("[data-testid='sale-price']") or \
            await card.query_selector("[data-testid='current-price'], .gl-price-item--sale")
        original_price_el = await card.query_selector("[data-testid='original-price'], .gl-price-item--crossed")

        current_price = self.parse_price(await current_price_el.inner_text()) if current_price_el else None
        original_price = self.parse_price(await original_price_el.inner_text()) if original_price_el else None

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
