from app.services.aqi import calculate_aqi, rolling_average_pollutants


def test_rolling_average_uses_only_data_available_at_that_hour():
    hourly = {"pm2_5": list(range(1, 25)) + [1000]}

    assert rolling_average_pollutants(hourly, 23)["pm2_5"] == 12.5


def test_rolling_average_requires_75_percent_of_window_values():
    hourly = {
        "pm2_5": [10] * 17,
        "ozone": [20] * 5,
    }

    averages = rolling_average_pollutants(hourly, 16)

    assert averages["pm2_5"] is None
    assert averages["ozone"] is None


def test_pm25_breakpoints_cover_good_and_moderate_categories():
    assert calculate_aqi({"pm2_5": 30}) == {
        "aqi": 50,
        "category": "good",
        "main_pollutant": "pm2_5",
    }
    assert calculate_aqi({"pm2_5": 90}) == {
        "aqi": 200,
        "category": "moderate",
        "main_pollutant": "pm2_5",
    }


def test_highest_sub_index_is_the_main_pollutant():
    result = calculate_aqi({"pm2_5": 30, "pm10": 250})

    assert result == {
        "aqi": 200,
        "category": "moderate",
        "main_pollutant": "pm10",
    }


def test_carbon_monoxide_is_converted_from_micrograms_to_milligrams():
    result = calculate_aqi({"pm2_5": 0, "carbon_monoxide": 1000})

    assert result == {
        "aqi": 50,
        "category": "good",
        "main_pollutant": "carbon_monoxide",
    }


def test_particulate_matter_is_required_for_an_aqi():
    assert calculate_aqi({"nitrogen_dioxide": 500}) == {
        "aqi": None,
        "category": None,
        "main_pollutant": None,
    }


def test_severe_category_at_maximum_breakpoint():
    assert calculate_aqi({"pm2_5": 500}) == {
        "aqi": 500,
        "category": "severe",
        "main_pollutant": "pm2_5",
    }
