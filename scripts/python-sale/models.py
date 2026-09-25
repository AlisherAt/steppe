"""Data model shared by all brand scrapers.

The output schema is designed to map directly onto a "product card":
new price, old price, photo(s), and descriptive info.
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import List, Optional


@dataclass
class Product:
    brand: str
    name: str
    url: str
    sku: Optional[str] = None
    color: Optional[str] = None
    current_price: Optional[float] = None      # новая (текущая) цена
    original_price: Optional[float] = None      # старая цена до скидки
    currency: str = "USD"
    discount_percent: Optional[float] = None
    image_urls: List[str] = field(default_factory=list)
    description: Optional[str] = None
    sizes_available: List[str] = field(default_factory=list)
    scraped_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def compute_discount(self):
        if self.current_price and self.original_price and self.original_price > 0:
            self.discount_percent = round(
                (1 - self.current_price / self.original_price) * 100, 1
            )

    def to_dict(self):
        return asdict(self)
