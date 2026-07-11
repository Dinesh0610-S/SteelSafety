"""
plants/registry.py
==================
Central plant registry — maps plant_id strings to their config dicts.
All engine, generator, and API code should use get_plant_config() rather
than importing plant configs directly.
"""

from plants.plant_a import PLANT_A_CONFIG
from plants.plant_b import PLANT_B_CONFIG

PLANT_REGISTRY: dict = {
    PLANT_A_CONFIG["plant_id"]: PLANT_A_CONFIG,
    PLANT_B_CONFIG["plant_id"]: PLANT_B_CONFIG,
}

DEFAULT_PLANT_ID: str = PLANT_A_CONFIG["plant_id"]

ALL_PLANT_IDS: list = list(PLANT_REGISTRY.keys())


def get_plant_config(plant_id: str) -> dict:
    """
    Look up a plant config by its plant_id string.
    Raises ValueError if the plant_id is not registered.
    """
    config = PLANT_REGISTRY.get(plant_id)
    if config is None:
        raise ValueError(
            f"Unknown plant_id '{plant_id}'. "
            f"Available: {list(PLANT_REGISTRY.keys())}"
        )
    return config
