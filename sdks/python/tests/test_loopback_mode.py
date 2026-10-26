"""Local sidecars may use aliases and fallback ports without hosted wallet rules."""
import pytest

from pmxt.constants import resolve_pmxt_base_url


@pytest.mark.parametrize('url', [
    'http://localhost:3847', 'http://localhost:3848',
    'http://127.0.0.1:49152', 'http://[::1]:49152/',
    'http://localhost:3847/', 'https://localhost:4443',
])
def test_explicit_and_environment_loopback_urls_keep_sidecar_mode(url):
    for arguments in ({'base_url': url, 'env': {}}, {'env': {'PMXT_BASE_URL': url}}):
        result = resolve_pmxt_base_url(**arguments)
        assert result.base_url == url
        assert result.is_hosted is False


@pytest.mark.parametrize('url', [
    'https://api.pmxt.dev', 'https://proxy.example.test',
    'http://localhost.example.test:3847', 'http://127.0.0.1.example.test:3847',
    'http://localhost:3847/hosted', 'http://localhost:3847?route=hosted',
    'http://localhost:65536', 'file://localhost/',
])
def test_other_urls_preserve_hosted_mode(url):
    assert resolve_pmxt_base_url(base_url=url, env={}).is_hosted is True


@pytest.mark.parametrize('from_environment', [False, True])
@pytest.mark.parametrize('auto_start', [None, False, True])
def test_explicit_sidecar_keeps_its_target_without_implicit_start(monkeypatch, from_environment, auto_start):
    import pmxt.client as client_module
    from unittest.mock import Mock

    monkeypatch.delenv('PMXT_API_KEY', raising=False)
    monkeypatch.delenv('PMXT_BASE_URL', raising=False)
    target = 'http://127.0.0.1:49152'
    manager = Mock()
    manager.get_server_info.return_value = {'port': 3847}
    manager.get_running_port.return_value = 3847
    monkeypatch.setattr(client_module, 'ServerManager', lambda *_: manager)
    kwargs = {'auto_start_server': auto_start}
    if from_environment:
        monkeypatch.setenv('PMXT_BASE_URL', target)
    else:
        kwargs['base_url'] = target
    client = client_module.Exchange('mock', **kwargs)
    assert client._resolve_sidecar_host() == target
    assert manager.ensure_server_running.call_count == int(auto_start is True)
    manager.get_server_info.assert_not_called()
    manager.get_running_port.assert_not_called()


def test_implicit_default_still_uses_owned_server_lock(monkeypatch):
    import pmxt.client as client_module
    from unittest.mock import Mock

    monkeypatch.delenv('PMXT_API_KEY', raising=False)
    monkeypatch.delenv('PMXT_BASE_URL', raising=False)
    manager = Mock()
    manager.get_server_info.return_value = {'port': 3848}
    manager.get_running_port.return_value = 3848
    monkeypatch.setattr(client_module, 'ServerManager', lambda *_: manager)
    client = client_module.Exchange('mock')
    assert client._resolve_sidecar_host() == 'http://localhost:3848'
    manager.ensure_server_running.assert_called_once()


@pytest.mark.parametrize('mode', ['argument', 'environment', 'implicit'])
@pytest.mark.parametrize('auto_start', [None, False, True])
def test_connection_retry_respects_startup_ownership(monkeypatch, mode, auto_start):
    import pmxt.client as client_module
    from unittest.mock import Mock

    monkeypatch.delenv('PMXT_API_KEY', raising=False)
    monkeypatch.delenv('PMXT_BASE_URL', raising=False)
    monkeypatch.setattr(client_module.time, 'sleep', lambda _: None)
    manager = Mock()
    manager.get_server_info.return_value = {'port': 3847}
    manager.get_running_port.return_value = 3847
    monkeypatch.setattr(client_module, 'ServerManager', lambda *_: manager)
    kwargs = {'auto_start_server': auto_start}
    if mode == 'argument':
        kwargs['base_url'] = 'http://127.0.0.1:49152'
    elif mode == 'environment':
        monkeypatch.setenv('PMXT_BASE_URL', 'http://127.0.0.1:49152')
    client = client_module.Exchange('mock', **kwargs)
    manager.ensure_server_running.reset_mock()
    request = Mock(side_effect=[ConnectionError('synthetic refusal'), 'success'])
    assert client._fetch_with_retry(request) == 'success'
    assert request.call_count == 2
    assert manager.ensure_server_running.call_count == int(mode == 'implicit' and auto_start is not False)
