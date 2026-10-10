from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

Status = Literal["planned", "ongoing", "completed"]


class TripCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    destination: str = Field(min_length=1, max_length=100)
    startDate: date
    endDate: date
    budget: float = Field(ge=0)
    currency: str = "PKR"
    travelerCount: int = Field(default=1, ge=1)
    status: Status = "planned"

    @model_validator(mode="after")
    def check_dates(self):
        if self.endDate < self.startDate:
            raise ValueError("endDate, startDate se pehle nahi ho sakti")
        return self


class TripUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    destination: Optional[str] = Field(default=None, min_length=1, max_length=100)
    startDate: Optional[date] = None
    endDate: Optional[date] = None
    budget: Optional[float] = Field(default=None, ge=0)
    currency: Optional[str] = None
    travelerCount: Optional[int] = Field(default=None, ge=1)
    status: Optional[Status] = None