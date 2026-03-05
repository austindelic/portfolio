# Fully Self-Hosted + Secured Portfolio (Home Lab SetupThis is a test.)

This portfolio is **fully self-hosted** on my own hardware and network, and secured behind **Cloudflare Zero Trust Access** (auth gate in front of the site). Deployments are handled via **Dockploy**, running on my home server.

---

# Overview

**Goal:** Host my personal portfolio from home with:

- no open inbound ports to my network  
- an authentication gate before the site loads  
- automated redeploys from my deployment platform (Dockploy)

### High-level architecture

- **Server:** $100 used PC (eBay)
- **Network:** connected to my home LAN via a switch
- **Public access:** Cloudflare Tunnel (no port forwarding)
- **Security:** Cloudflare Zero Trust Access
- **Deployments:** Dockploy

---

# Hardware + Network

## 1) The server

I purchased a small PC off eBay for **$100** and use it as my self-hosted server.

**Purpose**

- runs my portfolio
- runs Dockploy
- maintains a persistent Cloudflare Tunnel

The machine stays on my home network and acts as the origin for my website.
