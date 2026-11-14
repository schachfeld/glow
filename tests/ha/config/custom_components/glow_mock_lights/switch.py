"""Switches that remember what they were told, such as a lamp on a smart plug."""

from homeassistant.components.switch import SwitchEntity


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    async_add_entities(MockSwitch(switch) for switch in config["switches"])


class MockSwitch(SwitchEntity):
    _attr_should_poll = False

    def __init__(self, config):
        self._attr_unique_id = config["unique_id"]
        self._attr_name = config["name"]
        self._attr_is_on = config.get("on", False)

    async def async_turn_on(self, **kwargs):
        self._attr_is_on = True
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs):
        self._attr_is_on = False
        self.async_write_ha_state()
