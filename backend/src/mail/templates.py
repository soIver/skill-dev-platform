from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

from ..config import global_config


class EmailContentParser(HTMLParser):
    inline_tags = {"b", "strong", "i", "em", "u"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.open_tags: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        normalized_tag = tag.lower()
        if normalized_tag in self.inline_tags:
            self.parts.append(f"<{normalized_tag}>")
            self.open_tags.append(normalized_tag)
            return

        if normalized_tag == "br":
            self.parts.append("<br>")
            return

        if normalized_tag == "a":
            href = self._get_safe_href(attrs)
            if href is None:
                return
            escaped_href = escape(href, quote=True)
            self.parts.append(
                f'<a href="{escaped_href}" target="_blank" '
                'style="color:#0077c8;text-decoration:underline;">'
            )
            self.open_tags.append(normalized_tag)

    def handle_endtag(self, tag: str):
        normalized_tag = tag.lower()
        if normalized_tag not in self.open_tags:
            return

        self.open_tags.remove(normalized_tag)
        if normalized_tag in self.inline_tags:
            self.parts.append(f"</{normalized_tag}>")
        elif normalized_tag == "a":
            self.parts.append("</a>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]):
        if tag.lower() == "br":
            self.parts.append("<br>")
        else:
            self.handle_starttag(tag, attrs)
            self.handle_endtag(tag)

    def handle_data(self, data: str):
        self.parts.append(escape(data))

    def handle_entityref(self, name: str):
        self.parts.append(escape(f"&{name};"))

    def handle_charref(self, name: str):
        self.parts.append(escape(f"&#{name};"))

    def get_html(self) -> str:
        return "".join(self.parts)

    @staticmethod
    def _get_safe_href(attrs: list[tuple[str, str | None]]) -> str | None:
        href = next((value for key, value in attrs if key.lower() == "href"), None)
        if not href:
            return None

        parsed_href = urlparse(href)
        if parsed_href.scheme not in {"http", "https"}:
            return None

        return href


def render_email_content(text: str) -> str:
    parser = EmailContentParser()
    parser.feed(text.replace("</br>", "<br>"))
    parser.close()
    return parser.get_html()


def build_action_email_html(title: str, text: str, button_text: str, action_url: str) -> str:
    escaped_title = escape(title)
    rendered_text = render_email_content(text)
    escaped_button_text = escape(button_text)
    escaped_action_url = escape(action_url, quote=True)
    escaped_logo_src = escape(f"cid:{global_config.MAIL_LOGO_CONTENT_ID}", quote=True)
    escaped_site_url = escape(global_config.frontend_url(), quote=True)

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
