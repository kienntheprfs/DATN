
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.transports.base_transport import TransportParams

print(f"Methods: {[m for m in dir(SmallWebRTCTransport) if not m.startswith('_')]}")
