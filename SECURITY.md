# Security policy

## Supported versions

Security fixes are provided for the latest published major version of
`graph-engine`.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private
vulnerability reporting for this repository:

https://github.com/MhamedR/Graph-Engine/security/advisories/new

Include the affected version, impact, reproduction steps, and any suggested
mitigation. Reports will be acknowledged as soon as they can be triaged.

## Scope

Graph Engine executes application-provided callbacks synchronously. Callbacks
are trusted code and are not sandboxed. Consumers exposing graph mutation or
diagnostic APIs across a trust boundary must implement their own
authentication, authorization, quotas, and payload redaction.
