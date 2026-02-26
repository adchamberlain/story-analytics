"""
Email service for sending magic links.
"""

import os

import resend

from .config import get_settings

settings = get_settings()


def init_resend():
    """Initialize Resend with API key."""
    api_key = os.environ.get("RESEND_API_KEY")
    if api_key:
        resend.api_key = api_key
        return True
    return False


def send_magic_link_email(
    to_email: str,
    magic_link_url: str,
    is_new_user: bool = False,
) -> bool:
    """
    Send a magic link email to the user.

    Args:
        to_email: Recipient email address
        magic_link_url: The full URL with token
        is_new_user: Whether this is a new account

    Returns:
        True if email sent successfully, False otherwise
    """
    # For localhost URLs, print to console (Resend click tracking breaks localhost redirects)
    is_localhost = "localhost" in magic_link_url
    if is_localhost:
        print(f"\n{'='*60}")
        print("MAGIC LINK (use this for local dev - email link won't work)")
        print(f"{'='*60}")
        print(f"Email: {to_email}")
        print(f"Link:  {magic_link_url}")
        print(f"{'='*60}\n")

    if not init_resend():
        # No Resend configured, link already printed above if localhost
        if not is_localhost:
            print(f"[No Resend API key] Magic link for {to_email}: {magic_link_url}")
        return True

    subject = "Sign in to Story Analytics" if not is_new_user else "Welcome to Story Analytics"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{
                font-family: 'JetBrains Mono', 'Fira Code', monospace;
                background-color: #0a0a0a;
                color: #e0e0e0;
                padding: 40px;
                margin: 0;
            }}
            .container {{
                max-width: 500px;
                margin: 0 auto;
                background-color: #111111;
                border: 1px solid #222222;
                border-radius: 8px;
                padding: 32px;
            }}
            h1 {{
                color: #7c9eff;
                font-size: 24px;
                margin-top: 0;
            }}
            p {{
                color: #e0e0e0;
                line-height: 1.6;
            }}
            .button {{
                display: inline-block;
                background-color: transparent;
                color: #7c9eff;
                border: 1px solid #7c9eff;
                padding: 12px 24px;
                text-decoration: none;
                font-family: inherit;
                font-size: 14px;
                margin: 20px 0;
            }}
            .button:hover {{
                background-color: #7c9eff;
                color: #0a0a0a;
            }}
            .footer {{
                color: #666666;
                font-size: 12px;
                margin-top: 32px;
            }}
            .link {{
                color: #666666;
                word-break: break-all;
                font-size: 11px;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>{'Welcome!' if is_new_user else 'Sign in'}</h1>
            <p>
                {'Thanks for joining Story Analytics!' if is_new_user else 'Click the button below to sign in to your account.'}
            </p>
            <p>
                <a href="{magic_link_url}" class="button">> Sign in to Story Analytics</a>
            </p>
            <p class="footer">
                This link expires in 15 minutes.<br><br>
                If you didn't request this email, you can safely ignore it.
            </p>
            <p class="link">
                Or copy this link: {magic_link_url}
            </p>
        </div>
    </body>
    </html>
    """

    text_content = f"""
    {'Welcome to Story Analytics!' if is_new_user else 'Sign in to Story Analytics'}

    Click the link below to sign in:
    {magic_link_url}

    This link expires in 15 minutes.

    If you didn't request this email, you can safely ignore it.
    """

    try:
        from_email = os.environ.get("FROM_EMAIL", "Story Analytics <noreply@storyanalytics.io>")

        resend.Emails.send({
            "from": from_email,
            "to": to_email,
            "subject": subject,
            "html": html_content,
            "text": text_content,
        })
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False


def send_team_invite_email(
    to_email: str,
    team_name: str,
    invite_url: str,
    inviter_name: str = "A team admin",
) -> bool:
    """Send a team invite email to an unregistered user."""
    is_localhost = "localhost" in invite_url
    if is_localhost:
        print(f"\n{'='*60}")
        print("TEAM INVITE (use this for local dev)")
        print(f"{'='*60}")
        print(f"Email: {to_email}")
        print(f"Team:  {team_name}")
        print(f"Link:  {invite_url}")
        print(f"{'='*60}\n")

    if not init_resend():
        if not is_localhost:
            print(f"[No Resend API key] Team invite for {to_email}: {invite_url}")
        return True

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: 'JetBrains Mono', 'Fira Code', monospace; background-color: #0a0a0a; color: #e0e0e0; padding: 40px; margin: 0; }}
            .container {{ max-width: 500px; margin: 0 auto; background-color: #111111; border: 1px solid #222222; border-radius: 8px; padding: 32px; }}
            h1 {{ color: #7c9eff; font-size: 24px; margin-top: 0; }}
            p {{ color: #e0e0e0; line-height: 1.6; }}
            .button {{ display: inline-block; background-color: transparent; color: #7c9eff; border: 1px solid #7c9eff; padding: 12px 24px; text-decoration: none; font-family: inherit; font-size: 14px; margin: 20px 0; }}
            .footer {{ color: #666666; font-size: 12px; margin-top: 32px; }}
            .link {{ color: #666666; word-break: break-all; font-size: 11px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>You're invited!</h1>
            <p>{inviter_name} invited you to join <strong>{team_name}</strong> on Story Analytics.</p>
            <p>
                <a href="{invite_url}" class="button">> Join {team_name}</a>
            </p>
            <p class="footer">
                This invite expires in 7 days.<br><br>
                If you didn't expect this email, you can safely ignore it.
            </p>
            <p class="link">Or copy this link: {invite_url}</p>
        </div>
    </body>
    </html>
    """

    try:
        from_email = os.environ.get("FROM_EMAIL", "Story Analytics <noreply@storyanalytics.io>")
        resend.Emails.send({
            "from": from_email,
            "to": to_email,
            "subject": f"You're invited to join {team_name} on Story Analytics",
            "html": html_content,
            "text": f"{inviter_name} invited you to join {team_name} on Story Analytics.\n\nJoin here: {invite_url}\n\nThis invite expires in 7 days.",
        })
        return True
    except Exception as e:
        print(f"Failed to send team invite email: {e}")
        return False


def send_team_added_email(
    to_email: str,
    team_name: str,
    app_url: str,
    inviter_name: str = "A team admin",
) -> bool:
    """Send a notification email to a registered user who was added to a team."""
    is_localhost = "localhost" in app_url
    if is_localhost:
        print(f"\n{'='*60}")
        print("TEAM ADDED (notification)")
        print(f"{'='*60}")
        print(f"Email: {to_email}")
        print(f"Team:  {team_name}")
        print(f"{'='*60}\n")

    if not init_resend():
        if not is_localhost:
            print(f"[No Resend API key] Team added notification for {to_email}: {team_name}")
        return True

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: 'JetBrains Mono', 'Fira Code', monospace; background-color: #0a0a0a; color: #e0e0e0; padding: 40px; margin: 0; }}
            .container {{ max-width: 500px; margin: 0 auto; background-color: #111111; border: 1px solid #222222; border-radius: 8px; padding: 32px; }}
            h1 {{ color: #7c9eff; font-size: 24px; margin-top: 0; }}
            p {{ color: #e0e0e0; line-height: 1.6; }}
            .button {{ display: inline-block; background-color: transparent; color: #7c9eff; border: 1px solid #7c9eff; padding: 12px 24px; text-decoration: none; font-family: inherit; font-size: 14px; margin: 20px 0; }}
            .footer {{ color: #666666; font-size: 12px; margin-top: 32px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>You've been added to a team</h1>
            <p>{inviter_name} added you to <strong>{team_name}</strong> on Story Analytics.</p>
            <p>
                <a href="{app_url}/settings" class="button">> View your teams</a>
            </p>
            <p class="footer">You can leave the team at any time from your settings page.</p>
        </div>
    </body>
    </html>
    """

    try:
        from_email = os.environ.get("FROM_EMAIL", "Story Analytics <noreply@storyanalytics.io>")
        resend.Emails.send({
            "from": from_email,
            "to": to_email,
            "subject": f"You've been added to {team_name} on Story Analytics",
            "html": html_content,
            "text": f"{inviter_name} added you to {team_name} on Story Analytics.\n\nView your teams: {app_url}/settings",
        })
        return True
    except Exception as e:
        print(f"Failed to send team added email: {e}")
        return False
