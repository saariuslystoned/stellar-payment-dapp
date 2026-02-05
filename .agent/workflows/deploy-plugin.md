---
description: Deploy the Smoky Stellar Gateway plugin to WooCommerce staging site
---

# Deploy Plugin Workflow

Deploys `smoky-stellar-gateway.php` to SiteGround WooCommerce site via SSH.

## Prerequisites
- SSH key already added to SiteGround (done)
- Plugin file exists at `/home/bobbybones/src/git/bobbybones/stellar-payment-dapp/smoky-stellar-gateway.php`

## Steps

// turbo-all

1. **Check current plugin version on server**
```bash
ssh -p 18765 u5-17remgzmfn5b@c1115030.sgvps.net "grep 'Version:' ~/www/smokyproduct.co/public_html/wp-content/plugins/smoky-stellar-gateway/smoky-stellar-gateway.php"
```

2. **Check local plugin version**
```bash
grep 'Version:' /home/bobbybones/src/git/bobbybones/stellar-payment-dapp/smoky-stellar-gateway.php
```

3. **Upload the new plugin file**
```bash
scp -P 18765 /home/bobbybones/src/git/bobbybones/stellar-payment-dapp/smoky-stellar-gateway.php u5-17remgzmfn5b@c1115030.sgvps.net:~/www/smokyproduct.co/public_html/wp-content/plugins/smoky-stellar-gateway/
```

4. **Verify the upload succeeded**
```bash
ssh -p 18765 u5-17remgzmfn5b@c1115030.sgvps.net "grep 'Version:' ~/www/smokyproduct.co/public_html/wp-content/plugins/smoky-stellar-gateway/smoky-stellar-gateway.php && echo '✅ Plugin deployed successfully!'"
```

## One-liner (for quick deploys)
```bash
scp -P 18765 /home/bobbybones/src/git/bobbybones/stellar-payment-dapp/smoky-stellar-gateway.php u5-17remgzmfn5b@c1115030.sgvps.net:~/www/smokyproduct.co/public_html/wp-content/plugins/smoky-stellar-gateway/ && echo "✅ Deployed!"
```

## Notes
- SSH Host: c1115030.sgvps.net
- SSH Port: 18765
- SSH User: u5-17remgzmfn5b
- Plugin Path: ~/www/smokyproduct.co/public_html/wp-content/plugins/smoky-stellar-gateway/
- The plugin is already activated, so uploading updates it in-place (no reactivation needed)
