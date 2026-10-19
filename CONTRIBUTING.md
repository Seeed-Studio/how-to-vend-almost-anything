# Contributing

Version 0 is the frozen reference machine. A contribution is a proposal. It becomes a release only after review and testing. It does not replace the files in [`xiao-vending-machine-v0/`](xiao-vending-machine-v0/).

An alternative part is not a newer revision. A GitHub issue is not a public listing. Registering interest is not an application.

## Proposals → Review → Testing → Release

1. **Proposal.** Open a GitHub issue with the form that matches the work. The issue describes the change and points at evidence. It leaves Version 0 in place. The workbench can also open a draft pull request when the submission service in [`workers/contributions/`](workers/contributions/) is deployed. A draft pull request is still a proposal. It does not edit [`xiao-vending-machine-v0/`](xiao-vending-machine-v0/), [`parts-manifest.js`](docs/en/parts-manifest.js), or [`replacements.js`](docs/en/replacements.js).
2. **Review.** A maintainer checks the evidence before a lab, a machine, a person, a product, or an announcement is recorded.
3. **Testing.** The change is tried against the frozen reference, and the result is written down: what was built, what was measured, and what still fails.
4. **Release.** An accepted configuration is a new manifest under [`releases/machine/`](releases/machine/). Version 0 remains the baseline named in [`releases/reference.yaml`](releases/reference.yaml). Review and testing still gate that release. An accepted model is appended in `replacements.js` rather than overwriting Version Zero.

A draft pull request is not a release. Reliability and deployment notes stay on their GitHub issue forms.

## Where to file a proposal

| Work | Issue form |
| --- | --- |
| Dispensing mechanism | `contribute-dispensing.yml` |
| Product module | `contribute-product-module.yml` |
| Interfaces | `contribute-interfaces.yml` |
| Reliability | `contribute-reliability.yml` |
| Operator software | `contribute-operator-software.yml` |
| Deployment notes | `contribute-deployment-docs.yml` |
| A reusable machine change | `submit-improvement.yml` |
| A machine that is actually installed | `submit-installation.yml` |
| Early lab interest | `register-interest.yml` |

Approved records, once reviewed, are kept under [`community/`](community/): labs, machines, updates, and individuals. The public site does not invent installations, stock, prices, or support terms.
