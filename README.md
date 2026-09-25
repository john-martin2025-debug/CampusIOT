# CampusIoT: Smart Campus Resource Monitoring

**ESSE AAM Project — Group 3**

🌐 **Live website:** https://john-martin2025-debug.github.io/CampusIOT/

## About the project

Electricity and water use on most campuses is checked by hand, if at all, so waste is only noticed after it has happened. CampusIoT proposes an IoT-based predictive resource allocation system that monitors campus resources in real time and acts on waste automatically.

The system works in six stages: **Sense** (occupancy, energy and water sensors in each room), **Decide at the edge** (ESP32 nodes filter data locally), **Send** (readings travel over MQTT), **Analyse and predict** (usage patterns and anomalies are identified), **Act** (lights, fans and valves are switched off in empty spaces), and **Report** (dashboards for students, faculty, facility managers and administration).

The project supports **UN SDG 7** (Affordable and Clean Energy), **UN SDG 12** (Responsible Consumption and Production), and **ISO 14001** (Environmental Management).

## Website features

- Problem statement, stakeholders and sustainability alignment
- Solution architecture, node hardware and comparison of alternatives
- Live "Campus right now" monitoring simulation
- Loss estimator for wasted electricity and water
- Report section and references

## Repository contents

| Path | Description |
|------|-------------|
| `index.html` | Website structure and content |
| `style.css` | Styling and layout |
| `script.js` | Interactivity, campus simulation and loss estimator |
| `Group 3 (1).pdf` | Project presentation |
| `Individual_Technical_Report_Cover_AddPage.pdf` | Individual technical report |
| `README.md` | This file |

## How to run locally

No installation is needed. Download or clone the repository and open `index.html` in any modern web browser.

```bash
git clone https://github.com/john-martin2025-debug/CampusIOT.git
```

## Technologies

HTML5, CSS3, vanilla JavaScript, Google Fonts. Hosted on GitHub Pages.

## Team — ESSE Group 3

- John Martin Lijo
- Jose Christopher
- Joseph Jimmy
- Joseph Jyothish
- Joseph Mathew
- Joseph T Thayyil
