<div align="center">
  <img src="./src/assets/images/tapatchain.png" alt="TapatChain Logo" width="192">
  <h1>TapatChain</h1>
</div>

## Overview

TapatChain is a blockchain-powered transparency platform designed to monitor public infrastructure projects in the Philippines. By leveraging distributed ledger technology, the platform creates immutable audit trails, enables real-time milestone tracking, and ensures transparent fund flows to strengthen accountability in government infrastructure initiatives.

## Value, Functionality, and Uses

**Value**
- Increases transparency and reduces corruption in public works.
- Provides citizens, auditors, and government officials with verifiable, tamper‑proof project data.
- Enhances trust through permanent, publicly accessible records.

**Functionality**
- Role‑based access: Contractors, engineers, auditors, and administrators have tailored dashboards.
- Financial and physical progress tracking with integrity monitoring (flagging discrepancies).
- Public ledger for viewing project timelines, funding movements, and milestone progress.
- Community feedback and reporting mechanisms with optional photo evidence.
- Secure authentication via MetaMask wallet and reCAPTCHA protection.

**Uses**
- Monitoring fund disbursement and project progress by government agencies (e.g., DPWH).
- Auditing and compliance checks by oversight bodies (e.g., COA).
- Public participation: Citizens can view project status and submit feedback or reports.
- Internal project management by implementing agencies.

## How It Works

TapatChain operates through two interconnected systems:
1. **User Interface** – React web application where stakeholders (contractors, engineers, auditors, administrators, and the public) access role-specific dashboards and submit feedback.
2. **Processing Engine** – Backend service (`tapatchain-backend`) that validates user actions, records them on the blockchain, and manages data flow.

When a user performs an action:
1. Authenticate via MetaMask wallet with reCAPTCHA protection.
2. System verifies identity and assigns role‑based permissions (contractor, inspector, auditor, overseer, admin, etc.).
3. Action is processed by the backend and recorded as an immutable blockchain transaction.
4. All stakeholders can view the updated record in real‑time through their dashboards or the public ledger.
5. Data synchronizes between interface and engine for current project visibility, including financial/physical integrity metrics.

## Folder Structure
```
tapatchain/
├── src/                 # Frontend source code
│   ├── assets/          # Static resources
│   │   └── images/      # Contains tapatchain.png logo
│   ├── components/      # Reusable UI components
│   ├── context/         # React state management
│   ├── pages/           # Application views
│   └── shared/          # Shared utilities and types
├── public/              # Static web assets
├── scripts/             # Build automation scripts
├── .env.example         # Environment variable template
├── index.html           # Application entry point
├── package.json         # Frontend dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── vite.config.ts       # Frontend build configuration
```

*(Note: Backend code resides in the sibling directory `tapatchain-backend`)*

## Contact

For inquiries, collaborations, or support:
**Project Maintainer**: escarezjohnjoshuamanalo@gmail.com

## Notes for Contributors

- **Open for Contributors**: We welcome contributions from the community. Feel free to fork the repository, submit pull requests, and report issues.
- **Latest Issue**: Current security concern – inputs are not sufficiently sanitized, allowing potential upload of malicious files. An API limiter is already in place to mitigate abuse, but input validation and file type checking still need to be implemented.
