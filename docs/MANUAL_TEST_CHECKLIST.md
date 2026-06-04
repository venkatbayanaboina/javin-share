# Manual Test Checklist (Pre-Restructure Baseline)

Run this checklist before and after each restructure phase to catch regressions.

## Setup

- [ ] `npm install` from repo root completes without errors
- [ ] `npm start` starts server on port 4000
- [ ] Browser opens to HTTPS host page (or manual navigate works)
- [ ] Certificate trusted (no blocking security warning)

## Host flow

- [ ] Host page loads, device name prompt or reuse works
- [ ] QR code and PIN display
- [ ] PIN timer counts down
- [ ] Shutdown button stops server

## Client join

- [ ] Client opens PIN page via QR or manual URL
- [ ] Valid PIN joins session
- [ ] Invalid PIN shows error
- [ ] Grace timer appears on host after client verifies
- [ ] Host redirects to main (auto or "Go now")

## Main page

- [ ] Connected device count updates
- [ ] Send button enables when host ready + peers connected
- [ ] Exit session works (host and client)

## Send / receive

- [ ] Send: file selection and "Request to Send" works
- [ ] Receivers redirected to receive page
- [ ] Accept/reject prompt appears on receivers
- [ ] Upload progress shows on sender
- [ ] Download completes on receiver
- [ ] Transfer history updates

## Edge cases

- [ ] Page refresh on main preserves session
- [ ] Second client can join same session
- [ ] Only one sender at a time (send lock)

## Platforms (spot check)

- [ ] macOS host
- [ ] Windows or Linux client (browser)
- [ ] Mobile Safari or Chrome (optional)

## Notes

Record date, phase number, and any failures below:

```
Date:
Phase:
Tester:
Failures:
```
