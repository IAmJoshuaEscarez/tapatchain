
<div align="center">
  <img src="./src/assets/images/tapatchain.png" alt="TapatChain Logo" width="192">
  <h1>TapatChain</h1>
  <p>A Blockchain-Powered Transparency Platform for Philippine Public Infrastructure Projects</p>
</div>

---

## Overview

TapatChain is a decentralized accountability platform designed to monitor public infrastructure projects in the Philippines. By leveraging distributed ledger technology, the platform creates immutable audit trails, enables real-time milestone tracking, and ensures transparent fund flows to strengthen public trust and accountability in government infrastructure initiatives.

---

## Key Features & Value Proposition

### Value Architecture
* **Enhanced Transparency:** Reduces administrative gaps and anomalies in public works.
* **Verifiable Audit Trails:** Provides citizens, state auditors, and government officials with tamper-proof project data.
* **Civic Empowerment:** Fosters public trust through permanent, publicly accessible records.

### Core Functionality
* **Role-Based Access Control (RBAC):** Tailored dashboards engineered for Contractors, Engineers, Auditors, and Administrators.
* **Integrity Monitoring:** Real-time tracking of financial and physical project progress with automated discrepancy flagging.
* **Public Ledger Explorer:** An open interface for checking project timelines, funding allocations, and milestone completions.
* **Community Feedback Engine:** A reporting mechanism allowing citizens to submit localized updates with photo evidence.
* **Web3 Authentication:** Secure cryptographic login via MetaMask paired with reCAPTCHA bot protection.

### Target Use Cases
* **Agency Monitoring:** Project and fund disbursement management for implementing agencies (e.g., DPWH).
* **Oversight Compliance:** Streamlined verification processes for independent auditing bodies (e.g., COA).
* **Public Participation:** Active civic monitoring and open-source verification of public construction projects.

---

## System Architecture

TapatChain operates through two core synchronized environments:

1. **User Interface (Frontend):** A responsive React web application built with Vite and TypeScript where stakeholders interact with localized dashboards and public ledgers.
2. **Processing Engine (Backend):** A dedicated backend service (`tapatchain-backend`) that handles business logic, database operations, and dispatches transactions to the blockchain network.

### Transaction Lifecycle Flow
1. **Authentication:** The user logs in via MetaMask and passes reCAPTCHA validation.
2. **Authorization:** The backend verifies credentials and enforces role-based dashboard permissions.
3. **Execution:** The action (e.g., milestone update) is validated by the engine and recorded immutably on the blockchain ledger.
4. **Synchronization:** Data synchronizes dynamically, updating financial and physical integrity metrics across public and private views.

---

## Directory Structure

```text
tapatchain/
├── src/                 # Frontend source code
│   ├── assets/          # Static resources and brand assets
│   │   └── images/      # Contains tapatchain.png logo
│   ├── components/      # Reusable and atomic UI components
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

> **Note:** The core processing logic and API endpoints reside in the companion repository: `tapatchain api`.

---

## Quick Start Guide

Follow these steps to set up the frontend development environment on your local machine.

### Prerequisites

Ensure you have the following installed before proceeding:

* Node.js (v18.x or higher recommended)
* npm or yarn package manager
* MetaMask Browser Extension

### Installation Steps

1. **Clone the Repository**

```bash
   git clone [https://github.com/your-username/tapatchain.git](https://github.com/your-username/tapatchain.git)
   cd tapatchain

```

2. **Configure Environment Variables**
Copy the example environment file and populate it with your local configurations (e.g., RPC URLs, API endpoints).

```bash
   cp .env.example .env

```

3. **Install Dependencies**

```bash
   npm install

```

4. **Launch the Development Server**

```bash
   npm run dev

```

Open your browser and navigate to the address displayed in your terminal (typically `http://localhost:5173`).

---


### Current Security & Technical Focus

* **Input Sanitization & File Uploads:** We are currently tracking an issue where file uploads lack strict validation. While rate-limiting via an API gateway is deployed to mitigate brute-force abuse, comprehensive file-type verification and rigorous payload sanitization are actively being prioritized.
* **Mobile Environment Compatibility:** A known front-end issue exists where the hardware camera snapshot function fails to initialize or capture images properly when accessed through mobile browsers.
* **Feedback Spam Mitigation:** To ensure data quality and protect the platform from automated bots or bad-faith actors ("trolls"), we are continuously hardening our anti-spam implementation. This requires both frontend constraints (such as text-length validation and interaction thresholds) and backend defenses (such as IP/wallet-based cool-downs, request throttling, and payload analysis).

---


### How to Contribute
1. Fork the repository.
2. Create a specific feature or bug-fix branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes under clear, descriptive messages.
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request detailing your changes.

---

## Contact & Support

For inquiries, research collaborations, or technical support, contact the project maintainer:

* **Project Maintainer:** escarezjohnjoshuamanalo@gmail.com
