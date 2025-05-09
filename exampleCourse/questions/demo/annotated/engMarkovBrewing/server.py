import random

import numpy as np


def generate(data):
    ingredients = ["sugar water", "acid", "co2", "culture"]
    data["params"]["ingredients"] = ingredients

    beverages = ["water kefir", "kombucha"]
    data["params"]["beverage"] = np.random.choice(beverages)

    # Randomize entries
    data["params"]["sw_to_acid"] = random.choice([10, 15, 20])
    data["params"]["sw_to_culture"] = random.choice([10, 15, 20])
    data["params"]["acid_to_co2"] = random.choice([15, 20, 25])
    data["params"]["acid_to_culture"] = random.choice([1, 3, 5])
    data["params"]["co2_to_acid"] = random.choice([30, 35, 40, 45])

    # Randomize initial composition
    data["params"]["initial_sw"] = random.choice([70, 75, 80, 85])
    data["params"]["initial_culture"] = 100 - data["params"]["initial_sw"]
    data["params"]["percent_composition"] = random.randint(10, 25)
