#!/bin/bash

VERSION=$(node -p "require('./package.json').version")

git fetch --tags
VERSION_COUNT=$(git tag --list $VERSION | wc -l)

if [ $VERSION_COUNT -gt 0 ]
then
  echo "Version $VERSION already tagged."
  exit 0
else
  echo "Tagging version $VERSION"
fi

git tag $VERSION
git push origin refs/tags/$VERSION
