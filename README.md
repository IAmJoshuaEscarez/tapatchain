# TapatChain

<img src="./src/assets/images/tapatchain.png" alt="TapatChain Logo" width="200">

## Overview

TapatChain is a blockchain-powered transparency platform designed to monitor public infrastructure projects in the Philippines. By leveraging distributed ledger technology, the platform creates immutable audit trails, enables real-time milestone tracking, and ensures transparent fund flows to strengthen accountability in government infrastructure initiatives.

## Value, Functionality, and Uses

**Value**
- Promotes transparency and reduces corruption in public works.
- Provides citizens, auditors, and government officials with verifiable, tamper‑proof project data.
- Enhances trust through permanent, publicly accessible records.

**Functionality**
- End‑to‑end tracking of project funds from allocation to disbursement.
- Cryptographic verification of milestone completions.
- Secure channels for stakeholder feedback with photographic evidence.
- Role‑based views for contractors, engineers, auditors, and administrators.
- Real‑time synchronization between user interface and processing engine.

**Uses**
- Monitoring of government infrastructure projects.
- Auditing and compliance checks.
- Public participation and oversight.
- Internal management by project implementers.

## How It Works

TapatChain operates through two interconnected systems:
1. **User Interface** – Web application where stakeholders interact with project data based on their roles.
2. **Processing Engine** – Backend service that validates actions, records them on the blockchain, and manages data flow.

When a user performs an action:
1. Authenticate via MetaMask wallet with reCAPTCHA protection.
2. System verifies identity and assigns role‑based permissions.
3. Action is processed and recorded as a blockchain transaction.
4. All stakeholders can view the immutable record in real‑time.
5. Data synchronizes between interface and engine for current project visibility.

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