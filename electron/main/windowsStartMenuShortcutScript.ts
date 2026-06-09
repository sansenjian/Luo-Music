import { Buffer } from 'node:buffer'

export type WindowsStartMenuShortcutPayload = {
  appUserModelId: string
  arguments: string
  description: string
  iconPath: string
  shortcutPath: string
  targetPath: string
  workingDirectory: string
}

export function createWindowsStartMenuShortcutScript(
  payload: WindowsStartMenuShortcutPayload
): string {
  const payloadJson = JSON.stringify(payload)
  const payloadBase64 = Buffer.from(payloadJson, 'utf8').toString('base64')

  return `
$ErrorActionPreference = 'Stop'
$payloadJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payloadBase64}'))
$payload = $payloadJson | ConvertFrom-Json

Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

[ComImport]
[Guid("00021401-0000-0000-C000-000000000046")]
internal class CShellLink
{
}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("000214F9-0000-0000-C000-000000000046")]
internal interface IShellLinkW
{
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, IntPtr pfd, uint fFlags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
    void GetHotkey(out short pwHotkey);
    void SetHotkey(short wHotkey);
    void GetShowCmd(out int piShowCmd);
    void SetShowCmd(int iShowCmd);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
    void Resolve(IntPtr hwnd, uint fFlags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("0000010b-0000-0000-C000-000000000046")]
internal interface IPersistFile
{
    void GetClassID(out Guid pClassID);
    void IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
    void Save([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, [MarshalAs(UnmanagedType.Bool)] bool fRemember);
    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);
    void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName);
}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
internal interface IPropertyStore
{
    void GetCount(out uint cProps);
    void GetAt(uint iProp, out PROPERTYKEY pkey);
    void GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
    void SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
    void Commit();
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
internal struct PROPERTYKEY
{
    public Guid fmtid;
    public uint pid;

    public PROPERTYKEY(Guid fmtid, uint pid)
    {
        this.fmtid = fmtid;
        this.pid = pid;
    }
}

[StructLayout(LayoutKind.Explicit)]
internal struct PROPVARIANT
{
    [FieldOffset(0)]
    private ushort vt;

    [FieldOffset(8)]
    private IntPtr pointerValue;

    public static PROPVARIANT FromString(string value)
    {
        var variant = new PROPVARIANT();
        variant.vt = 31;
        variant.pointerValue = Marshal.StringToCoTaskMemUni(value);
        return variant;
    }

    public void Clear()
    {
        var result = PropVariantClear(ref this);
        if (result != 0)
        {
            Marshal.ThrowExceptionForHR(result);
        }
    }

    [DllImport("Ole32.dll")]
    private static extern int PropVariantClear(ref PROPVARIANT pvar);
}

public static class ShellShortcut
{
    // PKEY_AppUserModel_ID ("System.AppUserModel.ID").
    private static readonly PROPERTYKEY AppUserModelIdKey =
        new PROPERTYKEY(new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), 5);

    public static void Create(
        string shortcutPath,
        string targetPath,
        string arguments,
        string workingDirectory,
        string description,
        string iconPath,
        string appUserModelId)
    {
        var shortcutDirectory = Path.GetDirectoryName(shortcutPath);
        if (!String.IsNullOrEmpty(shortcutDirectory))
        {
            Directory.CreateDirectory(shortcutDirectory);
        }

        var linkObject = new CShellLink();
        var link = (IShellLinkW)linkObject;
        link.SetPath(targetPath);
        link.SetArguments(arguments ?? String.Empty);
        link.SetDescription(description ?? String.Empty);
        link.SetShowCmd(1);

        if (!String.IsNullOrWhiteSpace(workingDirectory))
        {
            link.SetWorkingDirectory(workingDirectory);
        }

        if (!String.IsNullOrWhiteSpace(iconPath) && File.Exists(iconPath))
        {
            link.SetIconLocation(iconPath, 0);
        }

        var propertyStore = (IPropertyStore)linkObject;
        var appIdKey = AppUserModelIdKey;
        var appIdValue = PROPVARIANT.FromString(appUserModelId);
        try
        {
            propertyStore.SetValue(ref appIdKey, ref appIdValue);
            propertyStore.Commit();
        }
        finally
        {
            appIdValue.Clear();
        }

        var persistFile = (IPersistFile)linkObject;
        persistFile.Save(shortcutPath, true);
    }
}
'@

[ShellShortcut]::Create(
  [string]$payload.shortcutPath,
  [string]$payload.targetPath,
  [string]$payload.arguments,
  [string]$payload.workingDirectory,
  [string]$payload.description,
  [string]$payload.iconPath,
  [string]$payload.appUserModelId
)
`.trim()
}
