"""Global sidecar credentials belong only to the owned loopback endpoint."""
import threading
from unittest.mock import Mock

import pytest
import pmxt.client as client_module


@pytest.fixture
def make_client(monkeypatch):
    monkeypatch.delenv('PMXT_API_KEY', raising=False)
    monkeypatch.delenv('PMXT_BASE_URL', raising=False)

    def make(target=None, **kwargs):
        manager = Mock()
        manager.get_server_info.return_value = {
            'port': 3847, 'accessToken': 'synthetic-sidecar-token',
        }
        monkeypatch.setattr(client_module, 'ServerManager', lambda *_: manager)
        client = client_module.Exchange('polymarket', base_url=target,
                                        auto_start_server=False, **kwargs)
        return client, manager
    return make


@pytest.mark.parametrize('target', [
    'https://foreign.example.test', 'http://localhost.example.test:3847',
    'http://127.0.0.1:49152', 'https://localhost:3847',
])
def test_other_endpoints_do_not_receive_global_token(make_client, target):
    client, manager = make_client(target)
    assert 'x-pmxt-access-token' not in client._get_auth_headers()
    if client.is_hosted or target.startswith('https:'):
        manager.get_server_info.assert_not_called()


@pytest.mark.parametrize('target', [None, 'http://127.0.0.1:3847'])
def test_owned_sidecar_still_receives_its_token(make_client, target):
    client, _ = make_client(target)
    assert client._get_auth_headers()['x-pmxt-access-token'] == 'synthetic-sidecar-token'


def test_hosted_bearer_is_preserved_without_reading_local_lock(make_client):
    client, manager = make_client('https://foreign.example.test',
                                  pmxt_api_key='synthetic-hosted-token')
    headers = client._get_auth_headers()
    assert headers['Authorization'] == 'Bearer synthetic-hosted-token'
    assert 'x-pmxt-access-token' not in headers
    manager.get_server_info.assert_not_called()


@pytest.mark.parametrize('url,expected', [
    ('ws://foreign.example.test/ws', None),
    ('ws://127.0.0.1:49152/ws', None),
    ('wss://localhost:3847/ws', None),
    ('ws://127.0.0.1:3847/ws', 'synthetic-sidecar-token'),
])
def test_websocket_override_uses_its_actual_endpoint(monkeypatch, make_client, url, expected):
    import pmxt.ws_client as ws_module

    class FakeSocket:
        def __init__(self, host, access_token=None, api_key=None, config=None):
            self.access_token = access_token
            self._lock = threading.Lock()
        def _ensure_connected(self):
            pass

    monkeypatch.setattr(ws_module, 'SidecarWsClient', FakeSocket)
    client, _ = make_client('http://127.0.0.1:3847', websocket={'wsUrl': url})
    assert client._get_or_create_ws().access_token == expected


def test_request_does_not_send_new_port_token_to_its_old_target(make_client):
    from types import SimpleNamespace

    client, manager = make_client()
    manager.get_server_info.side_effect = [
        {'port': 3847, 'accessToken': 'synthetic-old'},
        {'port': 3848, 'accessToken': 'synthetic-new'},
        {'port': 3848, 'accessToken': 'synthetic-new'},
    ]
    client._api_client.call_api = Mock(return_value=SimpleNamespace(
        read=lambda: None, data=b'{"success":true,"data":[]}', status=200))
    assert client.fetch_markets(limit=1) == []
    request = client._api_client.call_api.call_args.kwargs
    assert request['url'].startswith('http://localhost:3847/')
    assert 'x-pmxt-access-token' not in request['header_params']


def test_explicit_port_zero_does_not_borrow_port_eighty_token(make_client):
    client, manager = make_client('http://localhost:0')
    manager.get_server_info.return_value = {'port': 80, 'accessToken': 'synthetic-port-80'}
    assert 'x-pmxt-access-token' not in client._get_auth_headers()
