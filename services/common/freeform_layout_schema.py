from __future__ import annotations

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from services.common.layout_schema import ALLOWED_WIDGET_TYPES, _MAX_WIDGETS


class FreeformWidgetInstanceModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    type: str
    x: int
    y: int
    w: int
    h: int
    params: dict[str, str | int | float] | None = None

    @field_validator("type")
    @classmethod
    def known_type(cls, value: str) -> str:
        if value not in ALLOWED_WIDGET_TYPES:
            raise ValueError(f"Unknown widget type '{value}'")
        return value

    @field_validator("x", "y")
    @classmethod
    def non_negative(cls, value: int) -> int:
        if value < 0:
            raise ValueError("coordinates must be non-negative")
        return value

    @field_validator("w", "h")
    @classmethod
    def positive(cls, value: int) -> int:
        if value < 1:
            raise ValueError("dimensions must be positive")
        return value


class FreeformLayoutConfigModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    cols: int
    widgets: list[FreeformWidgetInstanceModel]

    @field_validator("version")
    @classmethod
    def v2_only(cls, value: int) -> int:
        if value != 2:
            raise ValueError("Unsupported layout version; expected 2")
        return value

    @field_validator("cols")
    @classmethod
    def canvas_width(cls, value: int) -> int:
        if value != 12:
            raise ValueError("cols must be 12")
        return value

    @model_validator(mode="after")
    def valid_geometry(self):
        if not self.widgets or len(self.widgets) > _MAX_WIDGETS:
            raise ValueError(f"widgets must contain 1 to {_MAX_WIDGETS} entries")
        for widget in self.widgets:
            if widget.x + widget.w > self.cols:
                raise ValueError("widget exceeds canvas bounds")
        for index, widget in enumerate(self.widgets):
            for other in self.widgets[index + 1:]:
                if widget.x < other.x + other.w and widget.x + widget.w > other.x and widget.y < other.y + other.h and widget.y + widget.h > other.y:
                    raise ValueError("widgets must not overlap")
        return self
