import mimetypes
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path

import anyio

from ..config import global_config
from ..utils.logger import get_logger

logger = get_logger("mail.delivery")


class MailDeliveryService:

    async def send_html_email(
        self,
        recipient: str,
        subject: str,
        text_body: str,
        html_body: str,
    ):
        await anyio.to_thread.run_sync(
            self._send_html_email_sync,
            recipient,
            subject,
            text_body,
            html_body,
        )

    def _send_html_email_sync(
        self,
        recipient: str,
        subject: str,
        text_body: str,
        html_body: str,
    ):
        if not global_config.MAIL_SMTP_PASSWORD:
            raise RuntimeError("MAIL_SMTP_PASSWORD не задан")

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = formataddr((global_config.MAIL_FROM_NAME, global_config.MAIL_FROM_EMAIL))
        message["To"] = recipient
        message.set_content(text_body)
        message.add_alternative(html_body, subtype="html")
        self._attach_logo(message)

        if global_config.MAIL_SMTP_USE_SSL:
            with smtplib.SMTP_SSL(
                global_config.MAIL_SMTP_HOST,
                global_config.MAIL_SMTP_PORT,
                timeout=10,
            ) as smtp:
                self._authenticate_and_send(smtp, recipient, message)
            return

        with smtplib.SMTP(
            global_config.MAIL_SMTP_HOST,
            global_config.MAIL_SMTP_PORT,
            timeout=10,
        ) as smtp:
            if global_config.MAIL_SMTP_STARTTLS:
                smtp.starttls()
            self._authenticate_and_send(smtp, recipient, message)

    def _authenticate_and_send(
        self,
        smtp: smtplib.SMTP,
        recipient: str,
        message: EmailMessage,
    ):
        smtp.login(global_config.MAIL_SMTP_USERNAME, global_config.MAIL_SMTP_PASSWORD)
        smtp.send_message(message, to_addrs=[recipient])
        logger.info("Письмо отправлено на %s", recipient)

    def _attach_logo(self, message: EmailMessage):
        logo_path = self._resolve_logo_path()
        if not logo_path.exists():
            raise RuntimeError("MAIL_LOGO_PATH указывает на несуществующий файл")

        content_type = mimetypes.guess_type(logo_path.name)[0] or "image/png"
        maintype, subtype = content_type.split("/", 1)
        html_part = message.get_payload()[-1]
        html_part.add_related(
            logo_path.read_bytes(),
            maintype=maintype,
            subtype=subtype,
            cid=f"<{global_config.MAIL_LOGO_CONTENT_ID}>",
            filename=logo_path.name,
            disposition="inline",
        )

    @staticmethod
    def _resolve_logo_path() -> Path:
        logo_path = Path(global_config.MAIL_LOGO_PATH)
        if logo_path.exists():
            return logo_path

        assets_dir = Path(__file__).resolve().parents[1] / "assets"
        for file_name in ("mail-logo.png", "mail-logo.jpg", "mail-logo.jpeg", "mail-logo.svg"):
            fallback_path = assets_dir / file_name
            if fallback_path.exists():
                return fallback_path

        return logo_path
