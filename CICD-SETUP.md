# MEDBIOHIM — CI/CD Setup Guide

## 🔴 Critical Blocker: GitHub Actions Secrets Missing

### Problem
Cloudflare Worker deployments fail because required secrets are not configured in GitHub repository settings.

---

## Step 1: Generate Cloudflare API Token

### Requirements
- Permissions: `Edit Cloudflare Workers` (least privilege)
- Account scope: Your Cloudflare account
- IP restriction: Optional (restrict to your office IP if possible)

### Generation Steps

1. **Go to Cloudflare Dashboard**
   - Navigate to: https://dash.cloudflare.com/profile/api-tokens
   
2. **Create New Token**
   - Click: "Create token" → "Use template" → Select "Edit Cloudflare Workers"
   - Or create custom:
     - Name: `MEDBIOHIM CI Deployments`
     - Permissions:
       - ✅ Workers Edit
       - ✅ Workers Analytics (read-only)
       - ❌ Avoid: Zone settings, Account management

3. **Configure Rule Conditions**
   ```yaml
   If these conditions match:
     - Resource = My Account
     - Operator = Equals
     - Value = Your Account ID (from dashboard URL)
   ```

4. **Save Token**
   - Copy the generated token value immediately (shown once!)
   - Format: `v4.xxxxxxxxxxxxxxxx...`

---

## Step 2: Add Secrets to GitHub Repository

### Access Repository Settings
```
https://github.com/MISTACEN/medbiohim/settings/secrets/actions
```

### Create Required Secrets

#### Secret #1: CLOUDFLARE_API_TOKEN ⚠️ MOST CRITICAL
```yaml
Name: CLOUDFLARE_API_TOKEN
Value: v4.your-actual-token-value-here
Description: Cloudflare API token for deploying Worker scripts
Sensitive: YES (encrypted)
```

#### Secret #2: SUPABASE_SERVICE_KEY (Optional for Migrations)
```yaml
Name: SUPABASE_SERVICE_KEY  
Value: eyJhZGRyZXNz...your-service-role-key
Description: Supabase service role key for database migrations
Sensitive: YES (encrypted)
Note: Only needed for backend schema migrations from CI
```

#### Secret #3: Upstash Credentials (Environment Variables OK)
```yaml
These can be set as environment variables in worker config:
- UPSTASH_BLOB_TOKEN
- UPSTASH_REDIS_URL
Not typically needed as separate secrets
```

### Verification Commands

After adding secrets, test manually:

```bash
# Clone or checkout your repo
git clone https://github.com/MISTACEN/medbiohim.git
cd medbiohim

# Trigger deployment workflow manually
gh run trigger .github/workflows/deploy-worker.yml -R MISTACEN/medbiohim
```

Or via web UI:
- Go to: https://github.com/MISTACEN/medbiohim/actions
- Select "Cloudflare Worker Deployment" workflow
- Click "Run workflows" → Run manual
- Branch: main

---

## Step 3: Verify Deployment Configuration

### Check `.github/workflows/deploy-worker.yml`

This file should exist and contain:

```yaml
name: Cloudflare Worker Deployment

on:
  push:
    branches: [main]
  workflow_dispatch:  # Manual trigger enabled

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        working-directory: ./workers/api
        run: npm ci
        
      - name: Type check
        working-directory: ./workers/api
        run: npm run typecheck
        
      - name: Build Worker
        working-directory: ./workers/api
        run: npm run build
        
      - name: Deploy to Cloudflare
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: "./workers/api"
          
      - name: Smoke Test
        run: |
          curl -f https://medbiohim-api.ryazansevegor.workers.dev/api/v1/health
```

If the workflow file is missing or incomplete:

**Create file:** `.github/workflows/deploy-worker.yml`
See full template in next section below.

---

## Step 4: Manual Testing After Configuration

### Quick Verification Checklist

```bash
# 1. Check Worker is reachable locally
cd workers/api
npm run dev  # Starts local mimic server

# 2. Test health endpoint
curl http://localhost:8787/api/v1/health

# Expected response: {"status":"ok","mode":"development"}

# 3. Push to trigger actual CI deployment
git add workers/api/src/routes/homework.ts
git commit -m "feat: add homework update/delete handlers"
git push origin main
```

### Monitor CI Workflow

After pushing code:
- Visit: https://github.com/MISTACEN/medbiohim/actions
- Watch for new workflow run
- Check logs for any errors

**Common Errors & Fixes:**

| Error | Cause | Solution |
|-------|-------|----------|
| `Authentication failed` | Invalid token | Re-generate CLOUDFLARE_API_TOKEN secret |
| `Unknown account ID` | Missing account ID | Add `CLOUDFLARE_ACCOUNT_ID` secret |
| `Build timeout` | Large dependency tree | Increase action timeout to 60min |
| `TypeScript errors` | Type mismatches | Fix type issues before committing |

---

## Complete Workflow Template

Here's a production-ready workflow file if yours needs updating:

```yaml
name: Cloudflare Worker Deployment

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  checks: write

env:
  WORKER_NAME: medbiohim-api
  WORKER_PATH: ./workers/api

jobs:
  typecheck:
    name: TypeScript Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          
      - name: Install dependencies
        working-directory: ${{ env.WORKER_PATH }}
        run: npm ci
        
      - name: Run typecheck
        working-directory: ${{ env.WORKER_PATH }}
        run: npm run typecheck

  build:
    name: Build & Deploy
    runs-on: ubuntu-latest
    needs: typecheck
    
    outputs:
      deployment_url: ${{ steps.deployment.outputs.url }}
      
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          
      - name: Install dependencies
        working-directory: ${{ env.WORKER_PATH }}
        run: npm ci
        
      - name: Build Worker
        working-directory: ${{ env.WORKER_PATH }}
        run: npm run build
        
      - name: Deploy to Cloudflare
        id: deployment
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: ${{ env.WORKER_PATH }}
          command: deploy --production --outdir dist

      - name: Get Deployment URL
        id: url-output
        run: echo "url=https://${{ env.WORKER_NAME }}.ryazansevegor.workers.dev" >> $GITHUB_OUTPUT

  smoke-test:
    name: Smoke Test Production Worker
    runs-on: ubuntu-latest
    needs: build
    
    steps:
      - name: Test Health Endpoint
        run: |
          curl -f https://${{ env.WORKER_NAME }}.ryazansevegor.workers.dev/api/v1/health || exit 1
            
      - name: Test Auth Route (Should return 401)
        run: |
          curl -f https://${{ env.WORKER_NAME }}.ryazansevegor.workers.dev/api/v1/auth/me \
            -o /dev/null -w "%{http_code}" \
            | grep -q "401" && echo "Auth protection working" || exit 1

  notify:
    name: Notify PR Authors
    runs-on: ubuntu-latest
    needs: [build, smoke-test]
    if: github.event_name == 'pull_request'
    
    steps:
      - name: Comment on PR
        uses: peter-evans/pr-comment@v1
        with:
          issue-number: ${{ github.event.pull_request.number }}
          comment: |
            🎉 Deployment successful! 
            
            Preview: ${{ needs.build.outputs.deployment_url }}
            
            Status: ✅ All checks passed
```

---

## Post-Setup Verification

Once CI/CD is working, verify:

### 1. Automated Deployments
```bash
# Make a small change
echo "// test commit" >> README.md
git add README.md
git commit -m "test: verify CI works"
git push

# Watch: GitHub Actions tab shows automatic deployment
```

### 2. Shadow Worker Traffic Reduction
After confirming stable for 1 week:
- Reduce shadow Worker traffic from 100% to <5%
- Remove shadow fallback after 2 weeks of stability

### 3. Monitoring Setup
Configure Cloudflare monitoring:
- Alerts for error rate > 1%
- Response time p99 > 2s alerts
- Daily report emails to maintainers

---

## Troubleshooting Common Issues

### Issue: "Invalid API Token" in Deployments
**Cause:** Token expired or permissions changed  
**Fix:** Regenerate token and update GitHub secret

### Issue: "Account ID Not Found"
**Cause:** CLOUDFLARE_ACCOUNT_ID secret missing  
**Find Account ID:**
1. Go to Cloudflare Dashboard
2. Look at URL: `https://dash.cloudflare.com/{account-id}/...`
3. Copy the UUID portion

### Issue: Build Timeout > 20 Minutes
**Cause:** Too many dependencies or large worker bundle  
**Fix:** 
```bash
# Optimize worker size
cd workers/api
npm run analyze-bundle  # Check what's bloating
npm prune               # Remove unused deps
```

### Issue: Tests Fail on CI but Pass Locally
**Cause:** Environment variable differences  
**Check:** All secrets available in CI context:
```typescript
// workers/api/src/env.ts should check
if (!process.env.CLOUDFLARE_API_TOKEN) {
  throw new Error('Missing required secret');
}
```

---

## Maintenance Schedule

### Monthly Tasks
- [ ] Rotate API tokens (security best practice)
- [ ] Review Cloudflare worker versions deployed
- [ ] Check for outdated npm dependencies

### Quarterly Tasks
- [ ] Audit GitHub Action permissions
- [ ] Update wrangler version to latest
- [ ] Review deployment rollback procedures

---

*Last Updated: 2026-10-22*
*Author: System-generated based on project audit*
