window.VENDING_PARTS = {
  machine: {
    id: "xiao-vending-machine",
    name: "售货机",
    referenceVersion: "V0",
    repository: "https://github.com/Seeed-Studio/how-to-vend-almost-anything",
    sourceRoot: "xiao-vending-machine-v0/xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files",
    note: "爆炸布局是为了理解产品，不是装配坐标图。"
  },
  groups: [
    {
      id: "shell",
      name: "外壳",
      description: "可编辑的箱体和闭合零件。",
      accent: "#dfe8da"
    },
    {
      id: "frame",
      name: "框架",
      description: "承载出货机构组的结构骨架。",
      accent: "#cfded5"
    },
    {
      id: "dispensing",
      name: "出货",
      description: "产品放出机构和货道支撑。",
      accent: "#9fd21b"
    },
    {
      id: "interface",
      name: "界面",
      description: "围绕 Wio Terminal、RFID 和状态灯的零件。",
      accent: "#d5e9ee"
    },
    {
      id: "foundation",
      name: "基座",
      description: "收尾机器的 L 型支架和脚垫。",
      accent: "#e8dcc7"
    }
  ],
  parts: [
    {
      id: "outer-enclosure",
      name: "外壳",
      group: "shell",
      qty: 1,
      source: "case/outer enclosure.step",
      format: "step",
      display: "models/outer-enclosure__v0.glb",
      role: "用可编辑的外壳包住参考搭建。"
    },
    {
      id: "top-plate",
      name: "顶板",
      group: "shell",
      qty: 1,
      source: "case/top plate.step",
      format: "step",
      display: "models/top-plate__v0.glb",
      role: "盖住并引导产品货道。"
    },
    {
      id: "back-plate",
      name: "背板",
      group: "shell",
      qty: 1,
      source: "case/back plate .step",
      format: "step",
      display: "models/back-plate__v0.glb",
      role: "封闭并加强机器背面。"
    },
    {
      id: "lock-holder",
      name: "锁座",
      group: "shell",
      qty: 1,
      source: "case/lock holder.step",
      format: "step",
      display: "models/lock-holder__v0.glb",
      role: "承载顶部闭合锁。"
    },
    {
      id: "mag-plate",
      name: "磁吸板",
      group: "shell",
      qty: 1,
      source: "case/Mag plate.step",
      format: "step",
      display: "models/mag-plate__v0.glb",
      role: "顶部闭合系统的一部分。"
    },
    {
      id: "pillar-a",
      name: "立柱 A",
      group: "frame",
      qty: 1,
      source: "parts/Pillar A .stl",
      format: "stl",
      display: "models/pillar-a__v0.glb",
      role: "承重骨架的一侧。"
    },
    {
      id: "pillar-b",
      name: "立柱 B",
      group: "frame",
      qty: 1,
      source: "parts/Pillar B.stl",
      format: "stl",
      display: "models/pillar-b__v0.glb",
      role: "承重骨架的另一侧。"
    },
    {
      id: "dispenser",
      name: "出货机构主体",
      group: "dispensing",
      qty: 4,
      source: "parts/dispenser.stl",
      format: "stl",
      display: "models/dispenser__v0.glb",
      role: "适配参考产品外形的通用出货机构主体。"
    },
    {
      id: "dispenser-specific",
      name: "特定产品出货机构",
      group: "dispensing",
      qty: 4,
      source: "parts/dispenser-specific.stl",
      format: "stl",
      display: "models/dispenser-specific__v0.glb",
      role: "用于把机构改到另一种产品外形的替代主体。",
      variantOf: "dispenser"
    },
    {
      id: "dispenser-arm",
      name: "出货摆臂",
      group: "dispensing",
      qty: 4,
      source: "parts/dispenser arm.stl",
      format: "stl",
      display: "models/dispenser-arm__v0.glb",
      role: "带动每一列出货的放出机构。"
    },
    {
      id: "spur-gear",
      name: "直齿轮 · 24 齿",
      group: "dispensing",
      qty: 1,
      source: "parts/Spur Gear 24 teeth.stl",
      format: "stl",
      display: "models/spur-gear__v0.glb",
      role: "把舵机转动传到放出机构。"
    },
    {
      id: "tube-support",
      name: "管支撑",
      group: "dispensing",
      qty: 1,
      source: "parts/Tube support .stl",
      format: "stl",
      display: "models/tube-support__v0.glb",
      role: "把四列出货机构组连在一起。"
    },
    {
      id: "wio-slider-holder",
      name: "Wio 滑槽座",
      group: "interface",
      qty: 1,
      source: "parts/slider_wio holder .stl",
      format: "stl",
      display: "models/wio-slider-holder__v0.glb",
      role: "定位面向顾客的 Wio Terminal。"
    },
    {
      id: "rfid-cap",
      name: "RFID 盖",
      group: "interface",
      qty: 1,
      source: "parts/RF ID cap .stl",
      format: "stl",
      display: "models/rfid-cap__v0.glb",
      role: "在顾客界面处容纳 RFID 读卡器。"
    },
    {
      id: "led-holder",
      name: "LED 座",
      group: "interface",
      qty: 1,
      source: "parts/LED holder .stl",
      format: "stl",
      display: "models/led-holder__v0.glb",
      role: "定位状态 LED。"
    },
    {
      id: "led-diffuser",
      name: "LED 扩散片",
      group: "interface",
      qty: 1,
      source: "parts/LED diffuser.stl",
      format: "stl",
      display: "models/led-diffuser__v0.glb",
      role: "在顾客界面处扩散状态灯。"
    },
    {
      id: "l-holder",
      name: "L 型支架",
      group: "foundation",
      qty: 6,
      source: "parts/L holder.stl",
      format: "stl",
      display: "models/l-holder__v0.glb",
      role: "六只支架连接结构件。"
    },
    {
      id: "small-feet",
      name: "小脚垫",
      group: "foundation",
      qty: 4,
      source: "parts/small feet .stl",
      format: "stl",
      display: "models/small-feet__v0.glb",
      role: "四只脚垫收尾并支撑外壳。"
    }
  ]
};
