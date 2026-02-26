# Deploying Story Analytics to AWS

Deploy your own Story Analytics instance to Amazon Web Services. This guide assumes zero cloud experience — follow every step from scratch.

## What You'll Get

- A live Story Analytics app at a public URL (e.g. `https://abc123.us-east-2.awsapprunner.com`)
- PostgreSQL database for metadata
- S3 storage for chart data and files
- User authentication enabled by default

**Estimated cost:** ~$30–50/month (mostly RDS database + NAT Gateway)
**Time to complete:** ~30–45 minutes

## What Gets Created

| Resource | Purpose |
|----------|---------|
| **App Runner** | Runs the application (like a web server) |
| **RDS PostgreSQL** | Database for users, charts, metadata |
| **S3 Bucket** | File storage for uploaded data and chart configs |
| **ECR Repository** | Stores your Docker image (the packaged app) |
| **VPC + Networking** | Private network so the database isn't exposed to the internet |

---

## Step 1: Install Required Tools

You need four tools on your computer. Install them in order.

### Docker Desktop

Docker packages the app into a container that runs on AWS.

- **macOS:** Download from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) — open the `.dmg` and drag to Applications
- **Windows:** Download from the same link — run the `.exe` installer, restart if prompted
- **Linux:** Follow [docs.docker.com/engine/install](https://docs.docker.com/engine/install/) for your distribution

Verify it's installed:

```bash
docker --version
# Docker version 27.x.x or similar
```

> **Important:** Docker Desktop must be **running** (not just installed) when you deploy. Open it from your Applications folder if it's not in your menu bar/system tray.

### AWS CLI

The AWS CLI lets your computer talk to your AWS account.

- **macOS:** `brew install awscli` (if you have Homebrew) or download from [aws.amazon.com/cli](https://aws.amazon.com/cli/)
- **Windows:** Download the MSI installer from [aws.amazon.com/cli](https://aws.amazon.com/cli/)
- **Linux:** `curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && unzip awscliv2.zip && sudo ./aws/install`

Verify:

```bash
aws --version
# aws-cli/2.x.x or similar
```

### Python 3.11+

Python runs the deploy script.

- **macOS:** `brew install python@3.11` or download from [python.org/downloads](https://www.python.org/downloads/)
- **Windows:** Download from [python.org/downloads](https://www.python.org/downloads/) — **check "Add Python to PATH"** during install
- **Linux:** `sudo apt install python3 python3-pip` (Ubuntu/Debian) or `sudo dnf install python3` (Fedora)

Verify:

```bash
python3 --version
# Python 3.11.x or higher
```

### Git

Git downloads the source code.

- **macOS:** Comes pre-installed. If not: `brew install git`
- **Windows:** Download from [git-scm.com](https://git-scm.com/)
- **Linux:** `sudo apt install git` (Ubuntu/Debian)

Verify:

```bash
git --version
```

---

## Step 2: Create an AWS Account

If you already have an AWS account, skip to Step 3.

1. Go to [aws.amazon.com](https://aws.amazon.com/) and click **Create an AWS Account**
2. Enter your email and choose an account name
3. Add a credit card for billing (you won't be charged until resources are created)
4. Complete identity verification (phone number)
5. Choose the **Basic (Free)** support plan

> **About costs:** Your first deploy will start incurring charges immediately (~$1–2/day). See the [Cost Management](#cost-management) section at the bottom for a full breakdown.

---

## Step 3: Create AWS Access Keys

Your computer needs credentials to create resources in your AWS account.

1. Sign in to the [AWS Console](https://console.aws.amazon.com/)
2. Click your account name (top-right corner) → **Security credentials**
3. Scroll down to **Access keys**
4. Click **Create access key**
5. Select **Command Line Interface (CLI)** as the use case
6. Check the confirmation box and click **Next**
7. Click **Create access key**
8. **Copy both values and save them somewhere safe:**
   - Access key ID (looks like `AKIAIOSFODNN7EXAMPLE`)
   - Secret access key (looks like `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`)

> **Security note:** These keys have full access to your account. Never share them, commit them to git, or post them online. If you suspect they've been compromised, delete them immediately from the Security credentials page and create new ones.

---

## Step 4: Configure AWS CLI

Tell your computer's AWS CLI about your access keys.

```bash
aws configure
```

It will ask for four things:

```
AWS Access Key ID: [paste your access key]
AWS Secret Access Key: [paste your secret key]
Default region name: us-east-2
Default output format: json
```

> **Which region?** `us-east-2` (Ohio) is a good default. `us-east-1` (N. Virginia) is also popular and has the most services. You can use any region, but be consistent throughout this guide.

Verify your credentials work:

```bash
aws sts get-caller-identity
```

You should see your account ID and user ARN. If you get an error, double-check your access key and secret key.

---

## Step 5: Clone the Repository

Download the Story Analytics source code:

```bash
git clone https://github.com/your-org/story-analytics.git
cd story-analytics
```

Install the Python dependency needed by the deploy script:

```bash
pip3 install boto3
```

> If `pip3` doesn't work, try `pip install boto3` or `python3 -m pip install boto3`.

---

## Step 6: Deploy

One command does everything:

```bash
python3 -m deploy.cli deploy --region us-east-2
```

You'll see seven steps:

```
Deploying Story Analytics to AWS...

[1/7] Checking AWS credentials...
  AWS Account : 123456789012
  User/Role   : arn:aws:iam::123456789012:user/your-name

[2/7] Ensuring ECR repository exists...
  ECR repo created: 123456789012.dkr.ecr.us-east-2.amazonaws.com/story-analytics

[3/7] Building and pushing Docker image...
  Building Docker image...
  Logging in to ECR...
  Tagging image...
  Pushing image to ECR...
  Image pushed successfully.

[4/7] Deploying CloudFormation stack (this takes ~10 min for RDS)...
  Creating stack 'story-analytics' in us-east-2...
  Waiting................ done.

[5/7] Setting FRONTEND_BASE_URL...

[6/7] Triggering App Runner deployment...

[7/7] Deployment complete!

  App URL      : https://abc123xyz.us-east-2.awsapprunner.com
  S3 Bucket    : story-analytics-data-123456789012
  RDS Endpoint : story-analytics-db.xxxx.us-east-2.rds.amazonaws.com
  DB Password  : xK9_mN2pLqRs7vW   (save this!)
```

**Save the DB Password!** You'll need it if you ever need to access the database directly. It's auto-generated and won't be shown again.

> **This takes 10–15 minutes.** Most of the wait is AWS creating the database (RDS). The dots show progress — don't close your terminal.

---

## Step 7: Access Your App

1. Copy the **App URL** from the deploy output
2. Open it in your browser
3. You may need to wait 2–3 minutes after deploy completes for App Runner to finish starting
4. Register your first user account (authentication is enabled by default)
5. Start creating charts!

> **If you see a "Service Unavailable" error:** Wait a few more minutes. App Runner needs time to start the container and pass health checks. Refresh after 2–3 minutes.

---

## Updating Your Deployment

When you pull new code and want to deploy it:

```bash
git pull
python3 -m deploy.cli update --region us-east-2
```

This rebuilds the Docker image and pushes it to ECR. App Runner automatically detects the new image and redeploys (~2–5 minutes).

---

## Setting Up Email (Optional)

Story Analytics can send email notifications for team invites. **Email is optional** — if not configured, invite links are shown directly in the UI for admins to copy and share manually.

To enable email delivery:

1. Sign up for a free account at [resend.com](https://resend.com/)
2. Create an API key in the Resend dashboard
3. Redeploy with the key:

```bash
python3 -m deploy.cli deploy --region us-east-2 --resend-api-key re_xxxxx --from-email "Your App <you@yourdomain.com>"
```

Or add to your `.env` file (in the project root) before deploying:

```
RESEND_API_KEY=re_xxxxx
FROM_EMAIL=Your App <you@yourdomain.com>
```

> **Note:** The default sender (`onboarding@resend.dev`) works for testing but emails may go to spam. For production, verify your own domain in the Resend dashboard.

---

## Checking Status

See your current deployment info:

```bash
python3 -m deploy.cli status --region us-east-2
```

Output shows the stack status, App URL, S3 bucket, and RDS endpoint.

---

## Tearing Down (Deleting Everything)

To permanently delete all AWS resources:

```bash
python3 -m deploy.cli destroy --region us-east-2
```

You'll be asked to type `yes` to confirm. This deletes:

- The App Runner service
- The RDS database (**all data is lost**)
- The S3 bucket
- The ECR repository and images
- All networking resources (VPC, subnets, NAT Gateway)

> **This is irreversible.** All your charts, users, and uploaded data will be permanently deleted. Export anything you need before running destroy.

To skip the confirmation prompt (e.g. in scripts):

```bash
python3 -m deploy.cli destroy --region us-east-2 --yes
```

---

## Troubleshooting

### "AWS credentials not configured"

Run `aws configure` and enter your access key and secret key. Verify with:

```bash
aws sts get-caller-identity
```

### Docker build fails with architecture mismatch

If you're on Apple Silicon (M1/M2/M3 Mac), the deploy script already handles this by building with `--platform linux/amd64`. Make sure Docker Desktop is running and up to date.

If you still see errors, try:
1. Open Docker Desktop → Settings → General
2. Ensure "Use Rosetta for x86_64/amd64 emulation on Apple Silicon" is checked
3. Restart Docker Desktop

### Stack creation fails / "ROLLBACK_COMPLETE"

The deploy script prints the failure reason. Common causes:

- **"Resource limit exceeded"** — Your AWS account may have limits on certain resources. Contact AWS Support to request an increase.
- **"The security token included in the request is invalid"** — Re-run `aws configure` with fresh credentials.
- **Timeout** — RDS creation can take up to 15 minutes. If it timed out, check the [CloudFormation console](https://console.aws.amazon.com/cloudformation/) for the stack status.

If a stack is stuck in `ROLLBACK_COMPLETE`, the deploy script automatically deletes it and recreates. Just run the deploy command again.

### "Service Unavailable" after deploy

App Runner needs 2–5 minutes to start after the stack completes. If it stays unavailable:

1. Go to the [App Runner console](https://console.aws.amazon.com/apprunner/)
2. Click your service (`story-analytics-service`)
3. Check the **Logs** tab for error messages
4. Verify the **Events** tab shows "Service status is running"

### Docker push fails with "no basic auth credentials"

ECR login tokens expire after 12 hours. The deploy script handles login automatically, but if you see this error, try running deploy again — it will re-authenticate.

### "No space left on device" during Docker build

Docker is running out of disk space. Clean up unused images:

```bash
docker system prune -a
```

Then retry the deploy.

---

## Cost Management

### Monthly Cost Breakdown (Estimated)

| Resource | Cost |
|----------|------|
| App Runner (1 vCPU, 2 GB) | ~$7/month (auto-scales to zero when idle) |
| RDS db.t4g.micro (PostgreSQL) | ~$13/month |
| NAT Gateway | ~$4/month + data transfer |
| S3 storage | ~$0.02/GB/month (negligible for most usage) |
| ECR image storage | ~$0.10/GB/month (negligible) |
| **Total** | **~$25–35/month** |

### Reducing Costs

- **Tear down when not in use:** The `destroy` command removes everything. Redeploy when you need it again.
- **Use a smaller database:** Add `--db-instance-class db.t4g.micro` (this is already the default and the smallest option).
- **Use less compute:** Add `--cpu 256 --memory 512` for lighter workloads (may be slower).

### Monitor Spending

1. Go to [AWS Billing Console](https://console.aws.amazon.com/billing/)
2. Click **Bills** to see current charges
3. Set up a **Budget** under Budgets → Create budget → set a monthly amount (e.g. $50) to get email alerts

---

## CLI Reference

```
python3 -m deploy.cli <command> [options]

Commands:
  deploy    Full deploy: create all AWS resources and start the app
  update    Rebuild and push a new Docker image (App Runner auto-deploys)
  status    Check deployment status and show resource info
  destroy   Tear down all AWS resources

Common options:
  --region REGION          AWS region (default: us-east-2)
  --stack-name NAME        CloudFormation stack name (default: story-analytics)

Deploy options:
  --db-password PASSWORD   Set RDS password (auto-generated if omitted)
  --cpu CPU                App Runner CPU units: 256, 512, 1024, 2048, 4096 (default: 1024)
  --memory MEMORY          App Runner memory in MB: 512–12288 (default: 2048)
  --db-instance-class CLS  RDS instance type (default: db.t4g.micro)
  --resend-api-key KEY     Resend API key for emails (reads from .env if omitted)
  --from-email EMAIL       Sender email address (reads from .env if omitted)

Destroy options:
  --yes, -y                Skip confirmation prompt
```
