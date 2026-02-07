from setuptools import setup, find_packages

setup(
    name="satellite_processor",
    version="0.1.0",
    packages=find_packages(include=["satellite_processor", "satellite_processor.*"]),
    install_requires=[
        "PyQt6>=6.4.0",
        "pyqtgraph>=0.13.1",
        "psutil>=5.9.0",
        'nvidia-ml-py>=11.525.112; platform_system=="Linux"',
        'WMI>=1.5.1; platform_system=="Windows"',
        "Pillow>=9.3.0",
        "numpy>=1.23.0",
        "opencv-python>=4.6.0",
        "python-dateutil>=2.8.2",
        "pyyaml>=6.0",
        "requests>=2.28.1",
    ],
    extras_require={
        "dev": [
            "pytest>=7.2.0",
            "black>=22.3.0",
            "pylint>=2.15.0",
            "pytest-qt>=4.0.0",
        ],
    },
    python_requires=">=3.10, <3.13",
)
