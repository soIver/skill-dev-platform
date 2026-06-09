from html import escape

from ..config import global_config


def render_email_content(text: str) -> str:
    content = escape(text)
    allowed_tags = {
        "&lt;b&gt;": "<b>",
        "&lt;/b&gt;": "</b>",
        "&lt;strong&gt;": "<strong>",
        "&lt;/strong&gt;": "</strong>",
        "&lt;i&gt;": "<i>",
        "&lt;/i&gt;": "</i>",
        "&lt;em&gt;": "<em>",
        "&lt;/em&gt;": "</em>",
        "&lt;u&gt;": "<u>",
        "&lt;/u&gt;": "</u>",
        "&lt;br&gt;": "<br>",
        "&lt;br/&gt;": "<br>",
        "&lt;br /&gt;": "<br>",
        "&lt;/br&gt;": "<br>",
    }

    for escaped_tag, html_tag in allowed_tags.items():
        content = content.replace(escaped_tag, html_tag)

    return content


def build_action_email_html(title: str, text: str, button_text: str, action_url: str) -> str:
    escaped_title = escape(title)
    rendered_text = render_email_content(text)
    escaped_button_text = escape(button_text)
    escaped_action_url = escape(action_url, quote=True)
    escaped_logo_src = escape(f"cid:{global_config.MAIL_LOGO_CONTENT_ID}", quote=True)
    escaped_site_url = escape(global_config.PUBLIC_SITE_URL, quote=True)

    return f"""\
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{escaped_title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;margin:0 auto;">
            <tr>
              <td align="left" style="padding:0 0 10px 0;">
                <a href="{escaped_site_url}" target="_blank" style="display:inline-block;text-decoration:none;">
                  <img src="{escaped_logo_src}" width="132" alt="IT Skill Dev" style="display:block;border:0;outline:none;text-decoration:none;max-width:132px;height:auto;">
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #9ca3af;border-radius:12px;border-collapse:separate;border-spacing:0;box-shadow:0 8px 24px rgba(17,24,39,0.08);overflow:hidden;">
                  <tr>
                    <td style="padding:28px;">
                      <h1 style="margin:0 0 18px 0;padding:0 0 12px 0;border-bottom:1px solid #9ca3af;font-size:24px;line-height:1.25;font-weight:700;color:#111827;">
                        {escaped_title}
                      </h1>
                      <div style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:#374151;">
                        {rendered_text}
                      </div>
                      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
                        <tr>
                          <td bgcolor="#0077c8" style="border-radius:12px;">
                            <a href="{escaped_action_url}" target="_blank" style="display:inline-block;padding:12px 22px;font-size:16px;line-height:1.2;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;background:#0077c8;">
                              {escaped_button_text}
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 4px 0 4px;font-size:12px;line-height:1.5;color:#6b7280;text-align:center;">
                Это письмо содержит важную информацию. Оно обязательно и не требует отписки.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""
