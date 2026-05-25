
<div align="center">
  <img src="./src/assets/images/tapatchain.png" alt="TapatChain Logo" width="192">
  <h1>TapatChain</h1>
  <p>A Blockchain-Powered Transparency Platform for Philippine Public Infrastructure Projects</p>
</div>

---

## Overview

TapatChain is a decentralized accountability platform designed to monitor public infrastructure projects in the Philippines. By leveraging distributed ledger technology, the platform creates immutable audit trails, enables real-time milestone tracking, and ensures transparent fund flows to strengthen public trust and accountability in government infrastructure initiatives.

---

## Features

* **Role-Based Access:** Tailored dashboards engineered specifically for Contractors, Engineers, Auditors, and Administrators.
* **Progress Tracking:** Real-time monitoring of financial and physical project progress with automated discrepancy flagging.
* **Public Explorer:** An open ledger interface for viewing project timelines, funding allocations, and milestone completions.
* **Feedback:** A reporting mechanism for citizens to submit updates and photo evidence.
* **Web3 Authentication:** Cryptographic user login via MetaMask paired with reCAPTCHA bot protection.

---

## Use Cases

* **Project Monitoring:** Fund disbursement and milestone tracking for implementing agencies (e.g., DPWH).
* **Compliance Auditing:** Streamlined verification and data extraction for oversight bodies (e.g., COA).
* **Public Monitoring:** Active civic participation through transparent and open-source verification of public construction projects.

---

## Architecture

TapatChain operates through two core synchronized environments:

1. **Frontend:** A responsive React web application built with Vite and TypeScript where users interact with localized dashboards and public ledgers.
2. **Backend:** A dedicated service (`tapatchain-backend`) that handles business logic, database management, and dispatches transactions to the blockchain network.

### Data Flow
1. **Auth:** User logs in via MetaMask and passes reCAPTCHA validation.
2. **Roles:** Backend verifies credentials and grants role-based dashboard permissions.
3. **Ledger:** Validated actions are processed by the backend and recorded permanently on the blockchain network.
4. **Sync:** Core metrics synchronize dynamically across public and internal dashboards.

---

## Structure

```text
tapatchain/
├── src/                 # Frontend source code
│   ├── assets/          # Static resources and brand assets
│   │   └── images/      # Contains tapatchain.png logo
│   ├── components/      # Reusable UI components
│   ├── context/         # Global React state management and hooks
│   ├── pages/           # Application views and dashboard layouts
│   └── shared/          # Utility functions, constants, and TypeScript types
├── public/              # Static web assets and service configurations
├── scripts/             # Build and deployment automation scripts
├── .env.example         # Template configuration file for environment variables
├── index.html           # Application HTML entry point
├── package.json         # Project manifests, scripts, and dependency definitions
├── tsconfig.json        # TypeScript compiler configurations
└── vite.config.ts       # Vite bundler and development server configuration

```

> **Note:** The core processing logic and API endpoints reside in the companion repository: `tapatchain-backend`.

---

## Setup

Follow these steps to set up the frontend development environment on your local machine.

### Prerequisites

* Node.js (v18.x or higher recommended)
* npm or yarn package manager
* MetaMask Browser Extension

### Installation

1. **Clone the Repository**

```bash
   git clone [https://github.com/your-username/tapatchain.git](https://github.com/your-username/tapatchain.git)
   cd tapatchain

```

2. **Configure Environment Variables**

```bash
   cp .env.example .env

```

3. **Install Dependencies**

```bash
   npm install

```

4. **Launch Development Server**

```bash
   npm run dev

```

Open your browser and navigate to `http://localhost:5173`.

---

## Known Issues

* **Input Sanitization:** File uploads currently lack strict backend validation. While API gateway rate-limiting is active, comprehensive file-type verification and multi-layer payload sanitization are still under development.
* **Mobile Camera Bug:** The hardware camera snapshot function fails to initialize or capture images properly when accessed through some mobile web browsers.
* **Spam Mitigation:** Ongoing hardening of the feedback engine. Future sprints include strict IP/wallet-based cool-downs and automated text analysis to prevent low-effort or automated bot entries.

---

## Contributing

1. Fork the repository.
2. Create a specific feature or bug-fix branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes with clear, descriptive messages.
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request detailing your changes.

---

## Contact

* **Project Maintainer:** escarezjohnjoshuamanalo@gmail.com

