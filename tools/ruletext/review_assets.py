#!/usr/bin/env python
"""Build and verify source-linked component review sidecars, never engine data."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

import fitz
from jsonschema import Draft202012Validator
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / 'spec/review'
REPORT = ROOT / 'DOCS/rules/transcripts/asset-review.md'


def read(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def local_path(path: str) -> Path:
    resolved = (ROOT / path).resolve()
    if not resolved.is_relative_to(ROOT):
        raise ValueError(f'path outside repository: {path}')
    return resolved


def sources():
    return {a['id']: a for a in read(ROOT / 'DOCS/artifacts/source-catalog.json')['assets']}


def assets():
    return read(ROOT / 'spec/assets/manifest.json')['assets'] + read(REVIEW / 'supplemental-assets.json')['assets']


def source_bytes(source, member=None, expected_member_hash=None):
    payload = local_path(source['path']).read_bytes()
    if digest(payload) != source['sha256']:
        raise ValueError(f'stale source: {source["id"]}')
    if member:
        # Named-member streaming cannot create archive paths, symlinks, or files.
        if Path(member).name != member or not member.endswith(('.pdf', '.txt')):
            raise ValueError(f'unsupported archive member: {member}')
        payload = subprocess.run(['tar', '-xOf', str(local_path(source['path'])), member],
                                 capture_output=True, check=True).stdout
        if digest(payload) != expected_member_hash:
            raise ValueError(f'stale archive member: {member}')
    return payload


def pdf_text(payload: bytes):
    with fitz.open(stream=payload, filetype='pdf') as doc:
        return [dict(page=i, text=p.get_text(), widthPoints=p.rect.width,
                     heightPoints=p.rect.height) for i, p in enumerate(doc, 1)]


def derive_details(note):
    symbols = note['symbols']
    cost = next((int(m.group(1)) for s in symbols
                 if (m := re.fullmatch(r'Cost: (\d+) bonus counters?\.', s))), None)
    return dict(classification=note['classification'], category=note['category'],
                symbols=symbols, bonusCounterCost=cost,
                timing=[s for s in symbols if 'turn' in s.lower() or 'effect badge' in s.lower()],
                modifiers=[s for s in symbols if any(k in s.lower() for k in
                           ['modifier', 'hand size', 'movement', 'stealth', 'crossed-out'])],
                rewards=[s for s in symbols if s.startswith('Reward:')],
                restrictions=[s for s in symbols if any(k in s.lower() for k in
                              ['cannot', 'crossed-out', 'enemy attachment'])])


def uncertainties(a, note):
    result = []
    if a['kind'] == 'block':
        result.append('Exact h1-h7 space assignment, edge/vertex arrays and complete bonus-corner geometry are not promoted by this visual review; use the source crop for a dedicated topology pass.')
    if 'Deviser' in ' '.join(note['symbols']) and a['kind'] == 'block':
        result.append('The small Deviser badge is recorded as printed evidence; its complete placement/reward interpretation requires the expansion rules.')
    if a['assetId'] == 'sh-en-blocks-a4-p01-c01':
        result.append('The highly stylized title is read as Geo.Framating; preserve the source image when resolving naming aliases.')
    if a['assetId'] == 'sp-en-action-cards-p02-c07':
        result.append('Resolve attachment-discard ordering against the rulebook before implementing Spammer.')
    if a['assetId'] == 'sh-en-action-cards-p01-c04':
        result.append('Ghost N812 has a card-activation stealth badge without a step count; do not invent a numeric movement budget.')
    if a['assetId'] == 'sh-en-control-cards-p02-c09':
        result.append('Deviser D prints a Delete activation badge without a skull; do not invent attack dice.')
    if a['kind'] == 'mode-reference':
        result.append('Chaos card glyphs and four defense tracks must be interpreted with the full Chaos procedure, not as an ordinary pawn profile.')
    return result


def render_supplemental():
    """Restore only ignored supplemental images from pinned source locators."""
    catalog=sources()
    for a in read(REVIEW/'supplemental-assets.json')['assets']:
        dest=local_path(a['outputs']['png'])
        if not dest.is_relative_to(ROOT/'tmp'):raise ValueError('image output must stay under tmp/')
        payload=source_bytes(catalog[a['artifactId']],a.get('sourceMember'),a.get('memberSha256'))
        with fitz.open(stream=payload,filetype='pdf') as doc:
            pix=doc[a['page']-1].get_pixmap(matrix=fitz.Matrix(a['renderDpi']/72,a['renderDpi']/72),alpha=False)
            dest.parent.mkdir(parents=True,exist_ok=True)
            if a.get('sourceMember'):
                pix.save(dest)
            else:
                c=a['crop'];im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
                im.crop((c['x'],c['y'],c['x']+c['width'],c['y']+c['height'])).save(dest)
        if digest(dest.read_bytes())!=a['pngSha256']:raise ValueError(f'render fingerprint changed: {a["assetId"]}')
    print('supplemental review images restored and checksum-verified')


def build():
    catalog = sources(); all_assets = assets(); notes = read(REVIEW / 'observations.json')
    ids = {a['assetId'] for a in all_assets}
    if len(ids) != len(all_assets) or ids != set(notes):
        raise ValueError(f'observation coverage mismatch: missing={ids-set(notes)}, extra={set(notes)-ids}')
    documents = {}; records = []
    for a in all_assets:
        n = notes[a['assetId']]; source = catalog[a['artifactId']]
        key = (a['artifactId'], a.get('sourceMember'))
        if key not in documents:
            payload = source_bytes(source, a.get('sourceMember'), a.get('memberSha256'))
            documents[key] = fitz.open(stream=payload, filetype='pdf')
        page = documents[key][a['page'] - 1]; c = a['crop']; scale = 72 / a['renderDpi']
        clip = fitz.Rect(c['x']*scale, c['y']*scale,
                         (c['x']+c['width'])*scale, (c['y']+c['height'])*scale)
        activation_actions = [s for s in n['symbols'] if 'activated' in s.lower() or 'free ' in s.lower()]
        main_actions=[]; inherited_rules=[]
        if a['kind']=='action-card':
            inherited_rules.append(dict(artifactId='sp-en-rulebook',locator='PDF p.30, Action cards',instruction='Choose one card use; the other printed parts do not also resolve.'))
            if n['category']=='block':
                main_actions.append('Block-target card use: '+n['specificInstructions'])
            else:
                target='enemy' if any('Enemy attachment' in s for s in n['symbols']) else 'pawn'
                main_actions.append(f'Attach to {target} in the printed {n["category"]} slot; apply its printed requirements and costs.')
            if n['category']=='armor':
                inherited_rules.append(dict(artifactId='sp-en-rulebook',locator='PDF p.36, Armor cards',instruction='Armor replaces the pawn’s defense dice and nullifies its ICE value.'))
        elif a['kind'] in ['block','control-card','mode-reference']:
            main_actions.append(n['specificInstructions'])
        else:
            main_actions.append('Assembly/use: '+n['specificInstructions'])
        records.append(dict(
            assetId=a['assetId'], game=source['game'], kind=a['kind'], name=n['name'],
            reviewStatus='visual-reviewed', provisional=True,
            source=dict(artifactId=a['artifactId'], path=source['path'], page=a['page'],
                        locator=(f'archive member {a["sourceMember"]}; ' if a.get('sourceMember') else '') +
                                f'PDF page {a["page"]}; asset {a["assetId"]}',
                        authority=source['authority'], language=source['language'],
                        sha256=source['sha256'], member=a.get('sourceMember'),
                        memberSha256=a.get('memberSha256')),
            image=dict(path=a['outputs']['png'], sha256=a['pngSha256'], renderDpi=a['renderDpi'], crop=c),
            transcription=dict(title=n['name'], rulesText=n['printedRules'],
                               rawExtractedText=page.get_text('text', clip=clip),
                               conventions='Gameplay prose visually normalized; printed grammar retained; non-text icons appear in square brackets. Raw extraction preserves duplicates, decorative labels and possible neighboring text; it is not a reviewed verbatim transcript.'),
            description=n['description'], details=derive_details(n),
            actions=n['actions'] + activation_actions + main_actions,
            inheritedRules=inherited_rules,
            specificInstructions=n['specificInstructions'],
            parts=n.get('parts', []), unresolved=uncertainties(a, n),
            symbolKeys=[dict(artifactId='sp-en-rulebook', locator='PDF p.37-38, Symbology'),
                        dict(artifactId='sh-en-rulebook', locator='PDF p.43, Symbology')],
            existingGameplayRef=a.get('gameplayRef'),
            canonicalPromotion='Not performed. English visual review and supporting-format inspection do not remove gameplay provisional flags or constitute bilingual record verification.'
        ))
    for doc in documents.values(): doc.close()
    records.sort(key=lambda r: r['assetId'])
    by_kind = dict(sorted(Counter(r['kind'] for r in records).items()))
    product = dict(reviewVersion=1, reviewedOn='2026-10-14', reviewer='Codex visual source review',
                   scope='All manifest assets plus control cards, Chaos reference, shared token sheets, and every distinct printable member in supporting archives. Rulebooks and alternate language/Letter editions retain complete raw source extraction in source-transcriptions.json; they are not claimed as freshly proofread verbatim transcripts.',
                   coverage=dict(assets=len(records), parts=sum(len(r['parts']) for r in records),
                                 byKind=by_kind, originalSources=len(catalog),
                                 archiveMembers=len(read(REVIEW / 'archive-members.json')['members'])),
                   records=records)
    write(REVIEW / 'asset-review.json', product)
    # Flat tables let reviewers sort every physical asset and every sheet part.
    with (REVIEW/'asset-review.csv').open('w', encoding='utf-8-sig', newline='') as handle:
        writer=csv.writer(handle)
        writer.writerow(['assetId','game','kind','name','category','class','printedRules','description','symbols','actions','specificInstructions','unresolved','artifactId','page','archiveMember','sourceSha256'])
        for r in records:
            writer.writerow([r['assetId'],r['game'],r['kind'],r['name'],r['details']['category'],r['details']['classification'],r['transcription']['rulesText'],r['description'],'\n'.join(r['details']['symbols']),'\n'.join(r['actions']),r['specificInstructions'],'\n'.join(r['unresolved']),r['source']['artifactId'],r['source']['page'],r['source']['member'],r['source']['sha256']])
    with (REVIEW/'sheet-parts.csv').open('w', encoding='utf-8-sig', newline='') as handle:
        writer=csv.writer(handle)
        writer.writerow(['partId','parentAssetId','name','locator','printedText','description','actions','specificInstructions'])
        for r in records:
            for p in r['parts']:writer.writerow([p['partId'],r['assetId'],p['name'],p['locator'],p['printedText'],p['description'],'\n'.join(p['actions']),p['specificInstructions']])
    source_records = []
    for source in catalog.values():
        payload = source_bytes(source)
        item = dict(**source, checksumVerified=True)
        if source['path'].endswith('.pdf'):
            item['pages'] = pdf_text(payload)
            item['textReviewStatus'] = 'raw-extracted; see component review for visually reviewed gameplay text'
        elif source['path'].endswith('.txt'):
            item['text'] = payload.decode('utf-8-sig', errors='replace')
            item['textReviewStatus'] = 'read'
        else:
            item['members'] = [m for m in read(REVIEW / 'archive-members.json')['members'] if m['artifactId'] == source['id']]
            item['textReviewStatus'] = 'named members inventoried; exact originals matched by checksum; distinct printable variants visually inspected'
        source_records.append(item)
    archive_transcriptions = []
    for member in read(REVIEW / 'archive-members.json')['members']:
        if member['equivalentArtifactId']: continue
        if any(m['sha256'] == member['sha256'] for m in archive_transcriptions): continue
        payload = source_bytes(catalog[member['artifactId']], member['member'], member['sha256'])
        archive_transcriptions.append(dict(**member, pages=pdf_text(payload)))
    write(REVIEW / 'source-transcriptions.json', dict(reviewVersion=1, sources=source_records,
                                                     distinctArchiveTranscriptions=archive_transcriptions))
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    lines = ['# Asset-by-asset visual review', '',
             'Generated from `spec/review/asset-review.json`; originals remain authoritative. See [review guide](../../artifacts/asset-review.md) for scope, uncertainty and regeneration.', '',
             f'{len(records)} asset records; {product["coverage"]["parts"]} individually listed sheet parts. Every record is provisional review evidence, not canonical executable data.', '',
             '| Kind | Records |', '|---|---:|']
    lines += [f'| {kind} | {count} |' for kind, count in by_kind.items()]
    for r in records:
        lines += ['', f'## {r["assetId"]} - {r["name"]}', '',
                  f'- Source: `{r["source"]["artifactId"]}`, {r["source"]["locator"]}.',
                  f'- Status: {r["reviewStatus"]}; canonical promotion pending.',
                  f'- Description: {r["description"]}', f'- Category: {r["details"]["category"]}; class: {r["details"]["classification"] or "none printed"}.',
                  '- Actions: ' + ('; '.join(r['actions']) or 'No standalone action; consult instructions.'),
                  f'- Specific instructions: {r["specificInstructions"]}']
        if r['transcription']['rulesText']:
            lines += ['', 'Printed gameplay/assembly text (normalized):', '', '```text',
                      r['transcription']['rulesText'], '```']
        if r['inheritedRules']:
            lines += ['', 'Inherited rulebook instructions:', '']+[f'- {rule["instruction"]} (`{rule["artifactId"]}`, {rule["locator"]}).' for rule in r['inheritedRules']]
        lines += ['', 'Details and symbols:', '']
        lines += [f'- {s}' for s in r['details']['symbols']] or ['- No additional gameplay symbols recorded.']
        if r['parts']:
            lines += ['', 'Individual sheet parts:', '', '| ID | Piece | Locator | Instruction |', '|---|---|---|---|']
            for part in r['parts']:
                cells=[part['partId'],part['name'],part['locator'],part['specificInstructions']]
                lines.append('| '+' | '.join(c.replace('|','\\|').replace('\n',' ') for c in cells)+' |')
        if r['unresolved']: lines += ['', 'Remaining interpretation/precision checks:', '']+[f'- {u}' for u in r['unresolved']]
    REPORT.write_text('\n'.join(lines)+'\n', encoding='utf-8')
    verify(require_originals=True)


def verify(require_originals=False):
    payload=read(REVIEW/'asset-review.json')
    Draft202012Validator(read(ROOT/'spec/schema/component-review.schema.json')).validate(payload)
    all_assets=assets(); index={a['assetId']:a for a in all_assets}; records=payload['records']; catalog=sources()
    if len(index)!=len(all_assets) or {r['assetId'] for r in records}!=set(index) or len(records)!=len(index):
        raise ValueError('asset coverage or uniqueness mismatch')
    if set(read(REVIEW/'observations.json'))!=set(index): raise ValueError('observation coverage mismatch')
    parts=[p['partId'] for r in records for p in r['parts']]
    if len(parts)!=len(set(parts)):raise ValueError('duplicate sheet part ID')
    if payload['coverage']['assets']!=len(records) or payload['coverage']['parts']!=len(parts):raise ValueError('stale coverage totals')
    if payload['coverage']['byKind']!=dict(Counter(r['kind'] for r in records)):raise ValueError('stale kind coverage')
    for filename,id_key,expected in [('asset-review.csv','assetId',set(index)),('sheet-parts.csv','partId',set(parts))]:
        with (REVIEW/filename).open(encoding='utf-8-sig',newline='') as handle:rows=list(csv.DictReader(handle))
        if {r[id_key] for r in rows}!=expected or len(rows)!=len(expected):raise ValueError(f'stale table {filename}')
    for r in records:
        a=index[r['assetId']];s=catalog[a['artifactId']]
        if r['source']['sha256']!=s['sha256'] or r['source']['sha256']!=a['sourceSha256'] or r['source']['page']!=a['page']:raise ValueError('stale source locator/hash')
        if r['image']['sha256']!=a['pngSha256'] or r['image']['crop']!=a['crop']:raise ValueError('stale image metadata')
        for p in r['parts']:
            if p.get('relatedReviewId') and p['relatedReviewId'] not in index:raise ValueError('unknown related review')
        if require_originals:
            source_bytes(s,a.get('sourceMember'),a.get('memberSha256'))
            image_path=local_path(r['image']['path'])
            if digest(image_path.read_bytes())!=r['image']['sha256']:raise ValueError(f'stale image {r["assetId"]}')
    source_data=read(REVIEW/'source-transcriptions.json')
    if {s['id'] for s in source_data['sources']}!=set(catalog):raise ValueError('original source coverage mismatch')
    for s in source_data['sources']:
        if s['sha256']!=catalog[s['id']]['sha256']:raise ValueError('stale source transcription')
    members=read(REVIEW/'archive-members.json')['members']
    if len(members)!=payload['coverage']['archiveMembers']:raise ValueError('stale archive coverage')
    if require_originals:
        for s in catalog.values():source_bytes(s)
        for m in members:source_bytes(catalog[m['artifactId']],m['member'],m['sha256'])
    print(f'asset review verified: {len(records)} assets, {len(parts)} sheet parts, {len(catalog)} originals, {len(members)} archive members')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['build','verify','render'])
    parser.add_argument('--require-originals',action='store_true')
    args=parser.parse_args()
    if args.command=='build':build()
    elif args.command=='render':render_supplemental()
    else:verify(args.require_originals)
