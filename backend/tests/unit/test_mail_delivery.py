from email.message import EmailMessage

import pytest

from src.mail.delivery import MailDeliveryService


def test_resolve_logo_path_uses_configured_existing_file(tmp_path, monkeypatch):
    logo = tmp_path / "logo.png"
    logo.write_bytes(b"png")
    monkeypatch.setattr("src.mail.delivery.global_config.MAIL_LOGO_PATH", str(logo))

    assert MailDeliveryService._resolve_logo_path() == logo


def test_attach_logo_adds_related_inline_part(tmp_path, monkeypatch):
    logo = tmp_path / "logo.png"
    logo.write_bytes(b"png")
    monkeypatch.setattr("src.mail.delivery.global_config.MAIL_LOGO_PATH", str(logo))

    message = EmailMessage()
    message.set_content("text")
    message.add_alternative("<p>html</p>", subtype="html")

    MailDeliveryService()._attach_logo(message)

    html_part = message.get_payload()[-1]
    related_parts = html_part.get_payload()

    assert len(related_parts) == 2
    assert related_parts[-1].get_content_type() == "image/png"
    assert related_parts[-1]["Content-ID"] == "<mail-logo>"


def test_attach_logo_raises_for_missing_logo(tmp_path, monkeypatch):
    monkeypatch.setattr(MailDeliveryService, "_resolve_logo_path", staticmethod(lambda: tmp_path / "missing.png"))

    message = EmailMessage()
    message.set_content("text")
    message.add_alternative("<p>html</p>", subtype="html")

    with pytest.raises(RuntimeError):
        MailDeliveryService()._attach_logo(message)
