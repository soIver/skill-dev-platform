import asyncio

from src.notifications import router as notifications


class FakePubSub:
    def __init__(self):
        self.closed = False

    async def aclose(self):
        self.closed = True


def test_shutdown_state_can_be_reset_and_triggered():
    notifications.trigger_shutdown()
    assert notifications.shutdown_event.is_set() is True

    notifications.reset_shutdown_state()
    assert notifications.shutdown_event.is_set() is False


def test_close_active_streams_closes_snapshot_and_keeps_set_for_generator_cleanup():
    pubsub = FakePubSub()
    notifications.active_pubsubs.add(pubsub)

    asyncio.run(notifications.close_active_streams())

    assert pubsub.closed is True
    notifications.active_pubsubs.clear()
