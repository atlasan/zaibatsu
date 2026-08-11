"""Put the parent `tools/` dir on sys.path so `import hexvision` works when
pytest is run from within tools/hexvision (or from the repo root)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
