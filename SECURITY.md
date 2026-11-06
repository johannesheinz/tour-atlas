# Security

Please report vulnerabilities privately through
[GitHub's private vulnerability reporting](https://github.com/johannesheinz/tour-atlas/security/advisories/new),
not in a public issue.

Tour Atlas is a static site without a backend, accounts or stored data; its service worker keeps only the site's
own files for offline use. Reports that matter most: ways to make the page run injected code or send requests
despite its Content-Security-Policy, ways to make the service worker serve or cache anything but the site's own
files, and tampered band data or logos that get through validation.
