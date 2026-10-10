from collections.abc import Mapping, Sequence
from math import ceil, isfinite
from typing import Any

POLLUTANT_BREAKPOINTS = {
    "pm2_5": ((0.0, 30.0), (31.0, 60.0), (61.0, 90.0), (91.0, 120.0), (121.0, 250.0), (251.0, 500.0)),
    "pm10": ((0.0, 50.0), (51.0, 100.0), (101.0, 250.0), (251.0, 350.0), (351.0, 430.0), (431.0, 600.0)),
    "nitrogen_dioxide": ((0.0, 40.0), (41.0, 80.0), (81.0, 180.0), (181.0, 280.0), (281.0, 400.0), (401.0, 1000.0)),
    "ozone": ((0.0, 50.0), (51.0, 100.0), (101.0, 168.0), (169.0, 208.0), (209.0, 748.0), (749.0, 1000.0)),
    "sulphur_dioxide": ((0.0, 40.0), (41.0, 80.0), (81.0, 380.0), (381.0, 800.0), (801.0, 1600.0), (1601.0, 2000.0)),
    "carbon_monoxide": ((0.0, 1.0), (1.1, 2.0), (2.1, 10.0), (10.1, 17.0), (17.1, 34.0), (34.1, 50.0)),
}
AQI_RANGES = ((50, "good"), (100, "satisfactory"), (200, "moderate"), (300, "poor"), (400, "veryPoor"), (500, "severe"))
AQI_SUBINDEX_RANGES = ((0, 50), (51, 100), (101, 200), (201, 300), (301, 400), (401, 500))
AVERAGING_HOURS = {
    "pm2_5": 24,
    "pm10": 24,
    "nitrogen_dioxide": 24,
    "sulphur_dioxide": 24,
    "ozone": 8,
    "carbon_monoxide": 8,
}


def _sub_index(pollutant: str, concentration: float) -> int:
    breakpoints = POLLUTANT_BREAKPOINTS[pollutant]
    if pollutant == "carbon_monoxide":
        concentration /= 1000.0

    for index, (concentration_low, concentration_high) in enumerate(breakpoints):
        if concentration <= concentration_high:
            aqi_low, aqi_high = AQI_SUBINDEX_RANGES[index]
            value = (
                (aqi_high - aqi_low)
                * (concentration - concentration_low)
                / (concentration_high - concentration_low)
                + aqi_low
            )
            return max(0, min(500, round(value)))
    return 500


def rolling_average_pollutants(
    hourly: Mapping[str, Sequence[float | int | None]],
    index: int,
) -> dict[str, float | None]:
    averages: dict[str, float | None] = {}
    for pollutant, window in AVERAGING_HOURS.items():
        series = hourly.get(pollutant)
        if not isinstance(series, Sequence):
            averages[pollutant] = None
            continue

        start = max(0, index - window + 1)
        available = series[start : min(index + 1, len(series))]
        values = [
            float(value)
            for value in available
            if isinstance(value, (int, float))
            and isfinite(value)
            and value >= 0
        ]
        if len(values) < ceil(window * 0.75):
            averages[pollutant] = None
        else:
            averages[pollutant] = sum(values) / len(values)
    return averages


def calculate_aqi_for_hour(
    hourly: Mapping[str, Sequence[float | int | None]],
    index: int,
) -> dict[str, int | str | None]:
    return calculate_aqi(rolling_average_pollutants(hourly, index))


def calculate_aqi(pollutants: Mapping[str, float | int | None]) -> dict[str, int | str | None]:
    # CPCB breakpoints require 24-hour/8-hour averages; hourly Open-Meteo values are rolled backward only, with no future data.
    valid_values = {
        pollutant: float(value)
        for pollutant, value in pollutants.items()
        if pollutant in POLLUTANT_BREAKPOINTS and value is not None and float(value) >= 0
    }
    if not any(pollutant in valid_values for pollutant in ("pm2_5", "pm10")):
        return {"aqi": None, "category": None, "main_pollutant": None}

    sub_indices = {
        pollutant: _sub_index(pollutant, concentration)
        for pollutant, concentration in valid_values.items()
    }
    main_pollutant = max(sub_indices, key=sub_indices.__getitem__)
    aqi = sub_indices[main_pollutant]
    category = next(category for threshold, category in AQI_RANGES if aqi <= threshold)
    return {"aqi": aqi, "category": category, "main_pollutant": main_pollutant}
