"""Мост STEPPE к WebChannel Agent Reach. Только публичные страницы двух магазинов."""
import json
import sys
from importlib.metadata import version
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit


def main():
    from agent_reach.channels.web import WebChannel

    if sys.argv[1:] == ["doctor"]:
        # check() upstream НЕ проверяет сеть. Живой тест выполняет scrape:reach.
        return {"version": version("agent-reach"), "backend": "Jina Reader",
                "importable": True, "network_tested": False}
    url = sys.argv[1] if len(sys.argv) == 2 else ""
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or parsed.netloc not in {"www.adidas.com", "www.nike.com"}
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or "\\" in url or "%" in parsed.path
            or not parsed.path.startswith(("/us/", "/w/", "/t/"))):
        raise ValueError("INVALID_STORE_URL")
    return {"markdown": WebChannel().read(url), "version": version("agent-reach"),
            "backend": "Jina Reader"}


if __name__ == "__main__":
    try:
        result = main()
    except HTTPError as error:
        result = {"error": f"READER_HTTP_{error.code}"}
    except URLError:
        result = {"error": "READER_NETWORK_ERROR"}
    except ModuleNotFoundError:
        result = {"error": "AGENT_REACH_NOT_INSTALLED"}
    except RuntimeError:
        result = {"error": "READER_ACCESS_CHALLENGE"}
    except Exception:
        result = {"error": "READER_FAILED"}
    print(json.dumps(result, ensure_ascii=True))
