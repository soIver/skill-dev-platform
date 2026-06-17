from src.mail.templates import build_action_email_html, render_email_content


def test_render_email_content_keeps_safe_inline_html_and_removes_unsafe_links():
    html = render_email_content(
        '<b>Привет</b><script>alert(1)</script><a href="javascript:bad()">x</a>'
        '<a href="https://example.com?a=1&b=2">link</a>'
    )

    assert "<b>Привет</b>" in html
    assert "alert(1)" in html
    assert "javascript:" not in html
    assert 'href="https://example.com?a=1&amp;b=2"' in html


def test_build_action_email_html_escapes_title_button_and_action_url():
    html = build_action_email_html(
        "<Title>",
        'Нажмите <a href="https://example.com">сюда</a>',
        "<Open>",
        "https://example.com/auth?code=a&next=b",
    )

    assert "&lt;Title&gt;" in html
    assert "&lt;Open&gt;" in html
    assert "https://example.com/auth?code=a&amp;next=b" in html
    assert 'href="https://example.com"' in html
