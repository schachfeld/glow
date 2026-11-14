"""Lights that remember what they were told, so tests can drive real Home Assistant."""

from homeassistant.components.light import (
    ATTR_BRIGHTNESS,
    ATTR_COLOR_TEMP_KELVIN,
    ATTR_HS_COLOR,
    ATTR_RGB_COLOR,
    ATTR_TRANSITION,
    ColorMode,
    LightEntity,
    LightEntityFeature,
)


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    async_add_entities(MockLight(light) for light in config["lights"])


class MockLight(LightEntity):
    _attr_should_poll = False

    def __init__(self, config):
        self._attr_unique_id = config["unique_id"]
        self._attr_name = config["name"]
        self._attr_available = config.get("available", True)
        self._attr_supported_color_modes = {
            ColorMode(mode) for mode in config.get("color_modes", ["onoff"])
        }
        self._attr_min_color_temp_kelvin = config.get("min_kelvin", 2200)
        self._attr_max_color_temp_kelvin = config.get("max_kelvin", 6500)
        if config.get("transition", True):
            self._attr_supported_features = LightEntityFeature.TRANSITION
        # The fade the last command asked for, in seconds; None if it had none.
        self._last_transition = None
        self._attr_is_on = config.get("on", False)
        self._attr_brightness = config.get("brightness", 255)
        self._attr_hs_color = (30.0, 60.0)
        self._attr_rgb_color = (255, 180, 100)
        self._attr_color_temp_kelvin = 2700
        modes = self._attr_supported_color_modes
        if ColorMode.COLOR_TEMP in modes:
            self._attr_color_mode = ColorMode.COLOR_TEMP
        else:
            self._attr_color_mode = next(iter(modes))

    @property
    def extra_state_attributes(self):
        return {"last_transition": self._last_transition}

    async def async_turn_on(self, **kwargs):
        self._attr_is_on = True
        self._last_transition = kwargs.get(ATTR_TRANSITION)
        if ATTR_BRIGHTNESS in kwargs:
            self._attr_brightness = kwargs[ATTR_BRIGHTNESS]
        if ATTR_COLOR_TEMP_KELVIN in kwargs:
            self._attr_color_temp_kelvin = kwargs[ATTR_COLOR_TEMP_KELVIN]
            self._attr_color_mode = ColorMode.COLOR_TEMP
        if ATTR_HS_COLOR in kwargs:
            self._attr_hs_color = kwargs[ATTR_HS_COLOR]
            self._attr_color_mode = ColorMode.HS
        if ATTR_RGB_COLOR in kwargs:
            self._attr_rgb_color = kwargs[ATTR_RGB_COLOR]
            self._attr_color_mode = ColorMode.RGB
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs):
        self._attr_is_on = False
        self._last_transition = kwargs.get(ATTR_TRANSITION)
        self.async_write_ha_state()
