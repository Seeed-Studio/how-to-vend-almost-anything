window.VENDING_PARTS = {
  machine: {
    id: "xiao-vending-machine",
    name: "XIAO Vending Machine",
    referenceVersion: "V0",
    repository: "https://github.com/Seeed-Studio/how-to-vend-almost-anything",
    sourceRoot: "xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files",
    note: "The exploded layout is arranged for product understanding, not as an assembly-coordinate drawing."
  },
  groups: [
    {
      id: "shell",
      name: "Shell",
      description: "Editable case and closure parts.",
      accent: "#dfe8da"
    },
    {
      id: "frame",
      name: "Frame",
      description: "The structural skeleton that carries the dispenser bank.",
      accent: "#cfded5"
    },
    {
      id: "dispensing",
      name: "Dispensing",
      description: "The product-release mechanism and column support.",
      accent: "#9fd21b"
    },
    {
      id: "interface",
      name: "Interface",
      description: "Parts around the Wio Terminal, RFID and status light.",
      accent: "#d5e9ee"
    },
    {
      id: "foundation",
      name: "Foundation",
      description: "Small physical details that finish the machine.",
      accent: "#e8dcc7"
    }
  ],
  parts: [
    {
      id: "outer-enclosure",
      name: "Outer enclosure",
      group: "shell",
      qty: 1,
      source: "case/outer enclosure.step",
      format: "step",
      display: "models/outer-enclosure__v0.glb",
      role: "Wraps the reference build in the editable outer shell."
    },
    {
      id: "top-plate",
      name: "Top plate",
      group: "shell",
      qty: 1,
      source: "case/top plate.step",
      format: "step",
      display: "models/top-plate__v0.glb",
      role: "Caps and guides the product columns."
    },
    {
      id: "back-plate",
      name: "Back plate",
      group: "shell",
      qty: 1,
      source: "case/back plate .step",
      format: "step",
      display: "models/back-plate__v0.glb",
      role: "Closes and stiffens the rear of the machine."
    },
    {
      id: "lock-holder",
      name: "Lock holder",
      group: "shell",
      qty: 1,
      source: "case/lock holder.step",
      format: "step",
      display: "models/lock-holder__v0.glb",
      role: "Carries the top closure lock."
    },
    {
      id: "mag-plate",
      name: "Mag plate",
      group: "shell",
      qty: 1,
      source: "case/Mag plate.step",
      format: "step",
      display: "models/mag-plate__v0.glb",
      role: "Part of the top closure system."
    },
    {
      id: "pillar-a",
      name: "Pillar A",
      group: "frame",
      qty: 1,
      source: "parts/Pillar A .stl",
      format: "stl",
      display: "models/pillar-a__v0.glb",
      role: "One side of the load-bearing skeleton."
    },
    {
      id: "pillar-b",
      name: "Pillar B",
      group: "frame",
      qty: 1,
      source: "parts/Pillar B.stl",
      format: "stl",
      display: "models/pillar-b__v0.glb",
      role: "The second side of the load-bearing skeleton."
    },
    {
      id: "l-holder",
      name: "L holder",
      group: "frame",
      qty: 6,
      source: "parts/L holder.stl",
      format: "stl",
      display: "models/l-holder__v0.glb",
      role: "Joins the structural members of the frame."
    },
    {
      id: "dispenser",
      name: "Dispenser body",
      group: "dispensing",
      qty: 4,
      source: "parts/dispenser.stl",
      format: "stl",
      display: "models/dispenser__v0.glb",
      role: "Common dispenser body for the reference product geometry."
    },
    {
      id: "dispenser-specific",
      name: "Product-specific dispenser",
      group: "dispensing",
      qty: 4,
      source: "parts/dispenser-specific.stl",
      format: "stl",
      display: "models/dispenser-specific__v0.glb",
      role: "Alternative body for adapting the mechanism to another product geometry.",
      variantOf: "dispenser"
    },
    {
      id: "dispenser-arm",
      name: "Dispenser arm",
      group: "dispensing",
      qty: 4,
      source: "parts/dispenser arm.stl",
      format: "stl",
      display: "models/dispenser-arm__v0.glb",
      role: "Moves the release mechanism for each dispensing column."
    },
    {
      id: "spur-gear",
      name: "Spur gear · 24 teeth",
      group: "dispensing",
      qty: 1,
      source: "parts/Spur Gear 24 teeth.stl",
      format: "stl",
      display: "models/spur-gear__v0.glb",
      role: "Transfers servo rotation into the release mechanism."
    },
    {
      id: "tube-support",
      name: "Tube support",
      group: "dispensing",
      qty: 1,
      source: "parts/Tube support .stl",
      format: "stl",
      display: "models/tube-support__v0.glb",
      role: "Ties the four-column dispenser bank together."
    },
    {
      id: "wio-slider-holder",
      name: "Wio slider holder",
      group: "interface",
      qty: 1,
      source: "parts/slider_wio holder .stl",
      format: "stl",
      display: "models/wio-slider-holder__v0.glb",
      role: "Positions the customer-facing Wio Terminal."
    },
    {
      id: "rfid-cap",
      name: "RFID cap",
      group: "interface",
      qty: 1,
      source: "parts/RF ID cap .stl",
      format: "stl",
      display: "models/rfid-cap__v0.glb",
      role: "Houses the RFID reader at the customer interface."
    },
    {
      id: "led-holder",
      name: "LED holder",
      group: "interface",
      qty: 1,
      source: "parts/LED holder .stl",
      format: "stl",
      display: "models/led-holder__v0.glb",
      role: "Positions the status LED."
    },
    {
      id: "led-diffuser",
      name: "LED diffuser",
      group: "interface",
      qty: 1,
      source: "parts/LED diffuser.stl",
      format: "stl",
      display: "models/led-diffuser__v0.glb",
      role: "Diffuses the status light at the customer interface."
    },
    {
      id: "small-feet",
      name: "Small feet",
      group: "foundation",
      qty: 4,
      source: "parts/small feet .stl",
      format: "stl",
      display: "models/small-feet__v0.glb",
      role: "Four feet finish and support the outer enclosure."
    }
  ]
};
