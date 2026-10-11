"""
Parameter parser — extracts and substitutes top-level numeric variables
from OpenSCAD code that use Customizer range comments.

Example line:  width = 40; // [10:100]
Parsed as:     {"name": "width", "value": 40.0, "min": 10.0, "max": 100.0, "step": 1.0}

Also handles step syntax:  corner_radius = 3; // [0:0.5:10]
Parsed as:     {"name": "corner_radius", "value": 3.0, "min": 0.0, "max": 10.0, "step": 0.5}
"""

import re
from typing import Any

# Matches:  var_name = 42; // [min:max]  OR  var_name = 42; // [min:step:max]
# Also handles negative numbers and decimals.
PARAM_REGEX = re.compile(
    r'^(\w+)\s*=\s*([+-]?\d+(?:\.\d+)?)\s*;\s*//\s*\[([^\]]+)\]',
    re.MULTILINE
)


def parse_params(code: str) -> list[dict[str, Any]]:
    """
    Extract all top-level parametric variables from OpenSCAD code.

    Returns a list of dicts, each with:
      name  — variable name (e.g. "slot_width")
      value — current numeric value
      min   — range minimum
      max   — range maximum
      step  — slider step increment
    """
    params = []
    for match in PARAM_REGEX.finditer(code):
        name = match.group(1)
        value = float(match.group(2))
        range_str = match.group(3)
        # Guard: skip this param if the range contains non-numeric parts
        try:
            parts = [float(x.strip()) for x in range_str.split(':')]
        except ValueError:
            continue  # e.g. range was [Solid, 1] — not a numeric slider

        if len(parts) == 2:
            # [min:max] — infer step from whether values are integers
            mn, mx = parts
            step = 1.0 if (mn == int(mn) and mx == int(mx)) else 0.1
        elif len(parts) == 3:
            # [min:step:max]
            mn, step, mx = parts
        else:
            continue  # malformed range, skip

        params.append({
            "name": name,
            "value": value,
            "min": mn,
            "max": mx,
            "step": step,
        })
    return params


def substitute_params(code: str, new_values: dict[str, float]) -> str:
    """
    Replace parameter values in OpenSCAD code without touching anything else.

    For each key in new_values, finds the matching `name = <old_value>;`
    line and replaces <old_value> with the new value. Preserves range
    comments, module definitions, and all other code.

    Args:
        code: Original OpenSCAD source.
        new_values: Dict of {param_name: new_numeric_value}.

    Returns:
        Updated OpenSCAD code string.
    """
    for name, new_val in new_values.items():
        # Match the specific variable assignment line, preserving the comment
        pattern = re.compile(
            rf'^({re.escape(name)}\s*=\s*)[+-]?\d+(?:\.\d+)?(\s*;.*)$',
            re.MULTILINE
        )
        # Format: use int if whole number, else float
        val_str = str(int(new_val)) if new_val == int(new_val) else str(new_val)
        code = pattern.sub(rf'\g<1>{val_str}\2', code, count=1)

    return code
