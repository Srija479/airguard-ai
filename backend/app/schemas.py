from pydantic import BaseModel, Field, model_validator

from .config_reports import REPORT_CATEGORIES


class ReportCreate(BaseModel):
    category: str
    activity_status: str
    title: str = Field(min_length=3, max_length=100)
    description: str = Field(default="", max_length=1000)
    place_name: str = Field(min_length=1, max_length=200)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def validate_category_and_status(self):
        if self.category not in REPORT_CATEGORIES:
            raise ValueError("Unknown report category")
        if self.activity_status not in REPORT_CATEGORIES[self.category]:
            raise ValueError("Activity status does not match report category")
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must be provided together")
        return self
