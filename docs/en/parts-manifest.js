window.VENDING_PARTS = {
  machine: {
    id: "xiao-vending-machine",
    name: "XIAO Vending Machine",
    referenceVersion: "V0",
    repository: "https://github.com/Seeed-Studio/how-to-vend-almost-anything",
    sourceRoot: "xiao-vending-machine-v0/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files",
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
      id: "storage",
      name: "Storage",
      description: "Four product columns that sit on the dispensers, and the XIAO boards they hold.",
      accent: "#d7e7a8"
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
      description: "L holders and feet that finish the machine.",
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
      id: "dispenser",
      name: "Dispenser body",
      group: "dispensing",
      qty: 4,
      source: "parts/dispenser.stl",
      format: "stl",
      display: "models/dispenser__v0.glb",
      role: "Common dispenser body for the reference product geometry.",
      supersededIn: "V1"
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
      variantOf: "dispenser",
      supersededIn: "V1"
    },
    {
      id: "dispenser-arm",
      name: "Dispenser arm",
      group: "dispensing",
      qty: 4,
      source: "parts/dispenser arm.stl",
      format: "stl",
      display: "models/dispenser-arm__v0.glb",
      role: "Moves the release mechanism for each dispensing column.",
      supersededIn: "V1"
    },
    {
      id: "spur-gear",
      name: "Spur gear · 24 teeth",
      group: "dispensing",
      qty: 4,
      source: "parts/Spur Gear 24 teeth.stl",
      format: "stl",
      display: "models/spur-gear__v0.glb",
      role: "Transfers servo rotation into the release mechanism.",
      supersededIn: "V1"
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
      id: "l-holder",
      name: "L holder",
      group: "foundation",
      qty: 6,
      source: "parts/L holder.stl",
      format: "stl",
      display: "models/l-holder__v0.glb",
      role: "Six brackets join the structural members."
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
    },
    {
      id: "product-column",
      name: "Product column",
      group: "storage",
      qty: 4,
      source: "parts/product-column.stl",
      format: "stl",
      display: "../models/product-column.stl",
      role: "OpenSCAD tube, 260 mm tall and 50 mm across, sized to sit on each dispenser. Version Zero bought this as PVC and did not include a model."
    },
    {
      id: "xiao-series",
      name: "XIAO series",
      group: "storage",
      qty: 13,
      source: "parts/xiao-series.stl",
      format: "stl",
      display: "../models/xiao-series.stl",
      role: "The XIAO family outline that the columns are meant to vend."
    },
    {
      id: "xiao-esp32s3",
      name: "XIAO ESP32-S3",
      group: "storage",
      qty: 10,
      source: "parts/xiao-esp32s3-only.stl",
      format: "stl",
      display: "../models/xiao-esp32s3-only.stl",
      role: "The XIAO ESP32-S3 model vended from the product columns."
    },
    {
      id: "wio-terminal",
      name: "Wio Terminal",
      group: "interface",
      qty: 1,
      source: "parts/wio-terminal.stl",
      format: "stl",
      display: "../models/wio-terminal.stl",
      role: "The controller board. It belongs with control and computing, beside the slider holder."
    },
    {
      id: "v1-dispensing-integrated",
      name: "V1 integrated dispenser",
      group: "dispensing",
      qty: 1,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-dispensing-integrated.stl",
      format: "stl",
      display: "../models/v1/v1-dispensing-integrated.stl",
      role: "One-piece V1 dispensing mechanism. Shown when V1 is assembled.",
      introducedIn: "V1",
      form: "integrated"
    },
    {
      id: "v1-dispensing-y-link",
      name: "V1 Y link",
      group: "dispensing",
      qty: 1,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-dispensing-y-link.stl",
      format: "stl",
      display: "../models/v1/v1-dispensing-y-link.stl",
      role: "Y link from the separated V1 dispenser.",
      introducedIn: "V1",
      form: "separated"
    },
    {
      id: "v1-dispensing-connector",
      name: "V1 connector",
      group: "dispensing",
      qty: 1,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-dispensing-connector.stl",
      format: "stl",
      display: "../models/v1/v1-dispensing-connector.stl",
      role: "Connector between the first and second links of the separated V1 dispenser.",
      introducedIn: "V1",
      form: "separated"
    },
    {
      id: "v1-dispensing-push-arm",
      name: "V1 push arm",
      group: "dispensing",
      qty: 1,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-dispensing-push-arm.stl",
      format: "stl",
      display: "../models/v1/v1-dispensing-push-arm.stl",
      role: "Push arm from the separated V1 dispenser.",
      introducedIn: "V1",
      form: "separated"
    },
    {
      id: "v1-dispensing-link-arm",
      name: "V1 link arm",
      group: "dispensing",
      qty: 1,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-dispensing-link-arm.stl",
      format: "stl",
      display: "../models/v1/v1-dispensing-link-arm.stl",
      role: "Link arm from the separated V1 dispenser.",
      introducedIn: "V1",
      form: "separated"
    },
    {
      id: "v1-dispensing-ft90m",
      name: "V1 FT90M",
      group: "dispensing",
      qty: 2,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-dispensing-ft90m.stl",
      format: "stl",
      display: "../models/v1/v1-dispensing-ft90m.stl",
      role: "FT90M piece from the separated V1 dispenser.",
      introducedIn: "V1",
      form: "separated"
    },
    {
      id: "v1-dispensing-upper-servo-plate",
      name: "V1 upper servo plate",
      group: "dispensing",
      qty: 1,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-dispensing-upper-servo-plate.stl",
      format: "stl",
      display: "../models/v1/v1-dispensing-upper-servo-plate.stl",
      role: "Upper servo fixing plate from the separated V1 dispenser.",
      introducedIn: "V1",
      form: "separated"
    },
    {
      id: "v1-dispensing-lower-fixing-plate",
      name: "V1 lower fixing plate",
      group: "dispensing",
      qty: 1,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-dispensing-lower-fixing-plate.stl",
      format: "stl",
      display: "../models/v1/v1-dispensing-lower-fixing-plate.stl",
      role: "Lower fixing plate from the separated V1 dispenser.",
      introducedIn: "V1",
      form: "separated"
    },
    {
      id: "v1-dispensing-m4-standoff",
      name: "V1 M4 standoff",
      group: "dispensing",
      qty: 8,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-dispensing-m4-standoff.stl",
      format: "stl",
      display: "../models/v1/v1-dispensing-m4-standoff.stl",
      role: "M4 copper standoff from the separated V1 dispenser.",
      introducedIn: "V1",
      form: "separated"
    },
    {
      id: "v1-storage-integrated",
      name: "V1 integrated storage",
      group: "storage",
      qty: 1,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-storage-integrated.stl",
      format: "stl",
      display: "../models/v1/v1-storage-integrated.stl",
      role: "One-piece V1 storage assembly. Shown when V1 storage is assembled.",
      introducedIn: "V1",
      form: "integrated"
    },
    {
      id: "v1-storage-upper-constraint-plate",
      name: "V1 upper constraint plate",
      group: "storage",
      qty: 1,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-storage-upper-constraint-plate.stl",
      format: "stl",
      display: "../models/v1/v1-storage-upper-constraint-plate.stl",
      role: "Upper constraint plate from the separated V1 storage.",
      introducedIn: "V1",
      form: "separated"
    },
    {
      id: "v1-storage-lower-fixing-plate",
      name: "V1 lower fixing plate",
      group: "storage",
      qty: 1,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-storage-lower-fixing-plate.stl",
      format: "stl",
      display: "../models/v1/v1-storage-lower-fixing-plate.stl",
      role: "Lower fixing plate from the separated V1 storage.",
      introducedIn: "V1",
      form: "separated"
    },
    {
      id: "v1-storage-middle-constraint-plate",
      name: "V1 middle constraint plate",
      group: "storage",
      qty: 1,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-storage-middle-constraint-plate.stl",
      format: "stl",
      display: "../models/v1/v1-storage-middle-constraint-plate.stl",
      role: "Middle constraint plate from the separated V1 storage.",
      introducedIn: "V1",
      form: "separated"
    },
    {
      id: "v1-storage-middle-constraint-plate-l",
      name: "V1 middle constraint plate L",
      group: "storage",
      qty: 1,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-storage-middle-constraint-plate-l.stl",
      format: "stl",
      display: "../models/v1/v1-storage-middle-constraint-plate-l.stl",
      role: "Left middle constraint plate from the separated V1 storage.",
      introducedIn: "V1",
      form: "separated"
    },
    {
      id: "v1-storage-side-fix",
      name: "V1 side fix",
      group: "storage",
      qty: 1,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-storage-side-fix.stl",
      format: "stl",
      display: "../models/v1/v1-storage-side-fix.stl",
      role: "Side fixing piece from the separated V1 storage.",
      introducedIn: "V1",
      form: "separated"
    },
    {
      id: "v1-storage-xiao-tube",
      name: "V1 bent XIAO tube",
      group: "storage",
      qty: 6,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-storage-xiao-tube.stl",
      format: "stl",
      display: "../models/v1/v1-storage-xiao-tube.stl",
      role: "Bent XIAO tube from the separated V1 storage.",
      introducedIn: "V1",
      form: "separated"
    },
    {
      id: "v1-storage-xiao-tube-thick",
      name: "V1 bent XIAO tube, thick",
      group: "storage",
      qty: 1,
      source: "xiao-vending-machine-v1/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files/parts/v1-storage-xiao-tube-thick.stl",
      format: "stl",
      display: "../models/v1/v1-storage-xiao-tube-thick.stl",
      role: "Thick bent XIAO tube from the separated V1 storage.",
      introducedIn: "V1",
      form: "separated"
    }
  ]
};
