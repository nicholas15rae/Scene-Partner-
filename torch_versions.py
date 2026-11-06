# Prints the torch and torchaudio versions Chatterbox installed (without "+cpu"), for setup-studio.bat
import importlib.metadata as m
print(m.version("torch").split("+")[0], m.version("torchaudio").split("+")[0])
