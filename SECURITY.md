# Security Policy

## Supported versions

MindMesh is under active development. Security fixes are applied to the `main` branch. Older
commits and forks are not supported.

## Reporting a vulnerability

Please report suspected vulnerabilities privately by email to
[ishan.vaidya01@gmail.com](mailto:ishan.vaidya01@gmail.com). Do not open a public issue,
discussion, or pull request that discloses the problem before it has been addressed.

Include as much of the following as you can:

- A description of the vulnerability and its impact
- Steps to reproduce, including the affected endpoint or WebSocket message
- The commit or version you tested
- Relevant logs or proof-of-concept code, with secrets and personal data removed
- Any suggested mitigation

You will receive an acknowledgement when the report is reviewed. Valid reports will be
investigated and fixed on a best-effort basis; timelines depend on severity and maintainer
availability. Please allow reasonable time for a fix before public disclosure.

## Scope

In scope:

- Authentication and authorization flaws, including room host/participant token checks
- Injection, unsafe deserialization, or path traversal
- Cross-site scripting or request forgery in the frontend
- Exposure of secrets, personal data, or session tokens
- Denial-of-service issues caused by application logic

Out of scope:

- Vulnerabilities in third-party services or dependencies without a demonstrated impact here
- Issues that require a compromised local machine or physical access
- Missing security headers or rate limits with no demonstrated exploit
- Social engineering and spam

## Safe harbour

Good-faith research that follows this policy will not be pursued or reported as a violation.
Do not access, modify, or exfiltrate data that does not belong to you, and do not disrupt
running services. Stop testing and report immediately if you encounter sensitive data.
