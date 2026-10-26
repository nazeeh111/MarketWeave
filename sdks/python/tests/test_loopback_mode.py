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
