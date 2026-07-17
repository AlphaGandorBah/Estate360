<# Build the local stack, trust Caddy for CurrentUser, and verify HTTPS. #>
[CmdletBinding()]
param(
    [string]$HttpsHost,
    [ValidateRange(30, 600)]
    [int]$TimeoutSeconds = 180
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$GatewayService = "gateway"
$CaddyRootCertificate = "/data/caddy/pki/authorities/local/root.crt"

function Invoke-DockerCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [switch]$Capture
    )

    if ($Capture) {
        $output = & docker @Arguments 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "docker $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
        }
        return (($output | Out-String).Trim())
    }

    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "docker $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

function Get-DotEnvValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }

    $value = $null
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -notmatch "^\s*$([Regex]::Escape($Name))\s*=\s*(.*)$") {
            continue
        }

        $candidate = $Matches[1].Trim()
        if (
            ($candidate.StartsWith('"') -and $candidate.EndsWith('"')) -or
            ($candidate.StartsWith("'") -and $candidate.EndsWith("'"))
        ) {
            $candidate = $candidate.Substring(1, $candidate.Length - 2)
        }
        else {
            $candidate = ($candidate -replace "\s+#.*$", "").Trim()
        }
        $value = $candidate
    }

    return $value
}

function Get-DefaultRouteIPv4 {
    if (
        (Get-Command Get-NetRoute -ErrorAction SilentlyContinue) -and
        (Get-Command Get-NetIPAddress -ErrorAction SilentlyContinue)
    ) {
        try {
            $routes = @(
                Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" -ErrorAction Stop |
                    Where-Object { $_.NextHop -ne "0.0.0.0" -and $_.State -ne "Dead" } |
                    Sort-Object RouteMetric
            )

            foreach ($route in $routes) {
                $addresses = @(
                    Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.ifIndex -ErrorAction Stop |
                        Where-Object {
                            $_.IPAddress -ne "127.0.0.1" -and
                            $_.IPAddress -notlike "169.254.*" -and
                            $_.AddressState -ne "Duplicate"
                        }
                )
                if ($addresses.Count -gt 0) {
                    return [string]$addresses[0].IPAddress
                }
            }
        }
        catch {
            # Fall through to the .NET network-interface API below. Some
            # managed Windows environments restrict the NetTCPIP cmdlets.
        }
    }

    try {
        $interfaces = @(
            [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
                Where-Object {
                    $_.OperationalStatus -eq [System.Net.NetworkInformation.OperationalStatus]::Up -and
                    $_.NetworkInterfaceType -notin @(
                        [System.Net.NetworkInformation.NetworkInterfaceType]::Loopback,
                        [System.Net.NetworkInformation.NetworkInterfaceType]::Tunnel
                    ) -and
                    @($_.GetIPProperties().GatewayAddresses | Where-Object {
                        $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
                        $_.Address.ToString() -ne "0.0.0.0"
                    }).Count -gt 0
                } |
                Sort-Object @{ Expression = {
                    if ($_.NetworkInterfaceType -eq [System.Net.NetworkInformation.NetworkInterfaceType]::Wireless80211) { 0 }
                    elseif ($_.NetworkInterfaceType -eq [System.Net.NetworkInformation.NetworkInterfaceType]::Ethernet) { 1 }
                    else { 2 }
                } }
        )

        foreach ($networkInterface in $interfaces) {
            $address = $networkInterface.GetIPProperties().UnicastAddresses |
                Where-Object {
                    $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
                    $_.Address.ToString() -ne "127.0.0.1" -and
                    $_.Address.ToString() -notlike "169.254.*"
                } |
                Select-Object -First 1
            if ($null -ne $address) {
                return $address.Address.ToString()
            }
        }
    }
    catch {
        return $null
    }

    return $null
}

function ConvertTo-HttpsHost {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $candidate = $Value.Trim()
    if ([string]::IsNullOrWhiteSpace($candidate)) {
        throw "HTTPS_HOST is empty. Pass -HttpsHost or set HTTPS_HOST in .env."
    }

    if ($candidate -match "^https?://") {
        $parsed = $null
        if (-not [Uri]::TryCreate($candidate, [UriKind]::Absolute, [ref]$parsed)) {
            throw "HTTPS_HOST '$candidate' is not a valid URL or host."
        }
        $candidate = $parsed.Host
    }

    if ($candidate.Contains("/") -or $candidate.Contains(":")) {
        throw "HTTPS_HOST must be a bare IPv4 address or hostname without a scheme, port, or path."
    }

    if ([Uri]::CheckHostName($candidate) -eq [UriHostNameType]::Unknown) {
        throw "HTTPS_HOST '$candidate' is not a valid IPv4 address or hostname."
    }

    return $candidate
}

function Wait-ForCaddy {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Timeout
    )

    $timer = [Diagnostics.Stopwatch]::StartNew()
    $lastState = "container not created"

    while ($timer.Elapsed.TotalSeconds -lt $Timeout) {
        $containerId = (& docker compose ps -q $GatewayService 2>$null | Select-Object -First 1)
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace([string]$containerId)) {
            $containerId = ([string]$containerId).Trim()
            $format = "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}"
            $lastState = (& docker inspect --format $format $containerId 2>$null | Select-Object -First 1)

            if ([string]$lastState -match "^(exited|dead)") {
                $logs = & docker compose logs --tail 40 $GatewayService 2>&1
                throw "The $GatewayService container stopped before Caddy was ready.`n$($logs -join [Environment]::NewLine)"
            }

            & docker compose exec -T $GatewayService caddy version *> $null
            $caddyRuns = $LASTEXITCODE -eq 0
            & docker compose exec -T $GatewayService sh -c "test -s '$CaddyRootCertificate'" *> $null
            $certificateExists = $LASTEXITCODE -eq 0

            if ($caddyRuns -and $certificateExists) {
                return
            }
        }

        Start-Sleep -Seconds 2
    }

    throw "Caddy did not become ready within $Timeout seconds (last gateway state: $lastState). Run 'docker compose logs gateway' for details."
}

function Test-HttpsEndpoint {
    param(
        [Parameter(Mandatory = $true)]
        [Uri]$Uri,
        [int]$Timeout = 60
    )

    Add-Type -AssemblyName System.Net.Http
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $lastFailure = "no response"

    while ($timer.Elapsed.TotalSeconds -lt $Timeout) {
        $handler = $null
        $client = $null
        $response = $null
        try {
            $handler = [System.Net.Http.HttpClientHandler]::new()
            $handler.AllowAutoRedirect = $false
            $handler.UseProxy = $false
            $client = [System.Net.Http.HttpClient]::new($handler)
            $client.Timeout = [TimeSpan]::FromSeconds(8)
            $response = $client.GetAsync($Uri).GetAwaiter().GetResult()
            $statusCode = [int]$response.StatusCode

            # A 401/403 from the S3 origin is expected and still proves that
            # DNS/IP routing, TLS trust, and Caddy are working end to end.
            if ($statusCode -lt 500) {
                return $statusCode
            }
            $lastFailure = "HTTP $statusCode"
        }
        catch {
            $lastFailure = $_.Exception.GetBaseException().Message
        }
        finally {
            if ($null -ne $response) { $response.Dispose() }
            if ($null -ne $client) { $client.Dispose() }
            if ($null -ne $handler) { $handler.Dispose() }
        }

        Start-Sleep -Seconds 2
    }

    throw "Could not verify $Uri within $Timeout seconds. Last failure: $lastFailure"
}

try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw "This bootstrap imports trust into the Windows CurrentUser certificate store and must run on Windows."
    }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker was not found. Install/start Docker Desktop and ensure 'docker' is on PATH."
    }
    if (-not (Get-Command Import-Certificate -ErrorAction SilentlyContinue)) {
        throw "The Windows Import-Certificate cmdlet is unavailable in this PowerShell session."
    }

    $repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
    $dotEnvPath = Join-Path $repoRoot ".env"
    $activeLanHost = Get-DefaultRouteIPv4

    $hostSource = "-HttpsHost"
    $configuredHost = $HttpsHost
    if ([string]::IsNullOrWhiteSpace($configuredHost)) {
        $configuredHost = $env:HTTPS_HOST
        $hostSource = "process environment"
    }
    if ([string]::IsNullOrWhiteSpace($configuredHost)) {
        $configuredHost = Get-DotEnvValue -Path $dotEnvPath -Name "HTTPS_HOST"
        $hostSource = ".env"
    }
    if ([string]::IsNullOrWhiteSpace($configuredHost)) {
        $configuredHost = $activeLanHost
        $hostSource = "active default route"
    }
    if ([string]::IsNullOrWhiteSpace($configuredHost)) {
        throw "HTTPS_HOST is not configured and the active LAN IPv4 could not be detected. Set HTTPS_HOST in .env or pass -HttpsHost."
    }

    $HttpsHost = ConvertTo-HttpsHost -Value $configuredHost
    $env:HTTPS_HOST = $HttpsHost

    if (-not [string]::IsNullOrWhiteSpace($activeLanHost) -and $HttpsHost -ne $activeLanHost) {
        Write-Warning "HTTPS_HOST is $HttpsHost, but the active default-route IPv4 is $activeLanHost. If the network changed, update .env and rerun this script."
    }
    if ($HttpsHost -in @("localhost", "127.0.0.1")) {
        Write-Warning "HTTPS_HOST=$HttpsHost is not reachable from a phone. Use this computer's LAN IPv4 instead."
    }

    Set-Location -LiteralPath $repoRoot
    Write-Host "Using HTTPS_HOST=$HttpsHost ($hostSource)."
    Invoke-DockerCommand -Arguments @("version", "--format", "{{.Server.Version}}") -Capture | Out-Null
    Invoke-DockerCommand -Arguments @("compose", "version", "--short") -Capture | Out-Null

    Write-Host "Building and starting Estate360..."
    Invoke-DockerCommand -Arguments @("compose", "up", "-d", "--build")

    Write-Host "Waiting for Caddy and its local CA..."
    Wait-ForCaddy -Timeout $TimeoutSeconds

    $certDirectory = [IO.Path]::GetFullPath((Join-Path $repoRoot ".certs"))
    $certPath = Join-Path $certDirectory "caddy-local-root.crt"
    New-Item -ItemType Directory -Path $certDirectory -Force | Out-Null

    Write-Host "Copying Caddy's public local root certificate..."
    Invoke-DockerCommand -Arguments @(
        "compose", "cp", "$GatewayService`:$CaddyRootCertificate", $certPath
    )

    if (-not (Test-Path -LiteralPath $certPath -PathType Leaf)) {
        throw "Caddy reported ready, but its public root certificate was not copied to $certPath."
    }

    $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($certPath)
    if ($certificate.HasPrivateKey) {
        throw "Refusing to import $certPath because it unexpectedly contains a private key."
    }
    $caExtension = $certificate.Extensions |
        Where-Object { $_.Oid.Value -eq "2.5.29.19" } |
        Select-Object -First 1
    if (
        $null -eq $caExtension -or
        -not ([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]$caExtension).CertificateAuthority
    ) {
        throw "Refusing to import $certPath because it is not marked as a certificate authority."
    }

    $thumbprint = $certificate.Thumbprint
    $trustedPath = "Cert:\CurrentUser\Root\$thumbprint"
    if (-not (Test-Path -LiteralPath $trustedPath)) {
        Write-Host "Trusting the Caddy root for the current Windows user only..."
        Import-Certificate -FilePath $certPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
    }
    else {
        Write-Host "The Caddy root is already trusted for the current Windows user."
    }

    if (-not (Test-Path -LiteralPath $trustedPath)) {
        throw "Certificate import completed without adding thumbprint $thumbprint to CurrentUser\Root."
    }

    $appUrl = [Uri]"https://$HttpsHost/"
    $apiUrl = [Uri]"https://$HttpsHost/api/v1/listings/"
    $mediaUrl = [Uri]"https://$HttpsHost`:9443/"
    Write-Host "Verifying trusted HTTPS endpoints..."
    $appStatus = Test-HttpsEndpoint -Uri $appUrl
    $apiStatus = Test-HttpsEndpoint -Uri $apiUrl
    if ($apiStatus -ne 200) {
        throw "The HTTPS gateway responded, but the public listings API returned HTTP $apiStatus instead of 200. Check ALLOWED_HOSTS and 'docker compose logs web'."
    }
    $mediaStatus = Test-HttpsEndpoint -Uri $mediaUrl

    Write-Host ""
    Write-Host "HTTPS is ready." -ForegroundColor Green
    Write-Host "App:   $appUrl (HTTP $appStatus)"
    Write-Host "API:   $apiUrl (HTTP $apiStatus)"
    Write-Host "Media: $mediaUrl (HTTP $mediaStatus; 401/403 at the origin root is normal)"
    Write-Host "CA:    $certPath"
    Write-Host "Trust: CurrentUser\Root thumbprint $thumbprint"
}
catch {
    [Console]::Error.WriteLine("HTTPS bootstrap failed: $($_.Exception.Message)")
    exit 1
}
